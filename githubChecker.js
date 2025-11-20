// githubChecker.js
import fetch from "node-fetch";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

/**
 * Configuration
 */
const BASE_EMBED_COLOR = 0x2f3136; // dark background base
const ACCENT_COLOR = 0x3498db; // blue accent for highlights
const COMMIT_ROLE_ID = process.env.COMMIT_ROLE_ID || null;
const GROUP_WINDOW_MS = 10 * 1000; // 10 seconds grouping window (your choice B)

/**
 * In-memory buffers for grouped commits (not persisted)
 */
const pendingCommits = new Map(); // Map<repoFullName, Array<entry>>
const commitTimers = new Map(); // Map<repoFullName, Timeout>

/**
 * Start the checker (called by index.js)
 * @param {Object} param0
 * @param {import('discord.js').Client} param0.client
 * @param {import('lowdb').Low} param0.db
 * @param {number} param0.POLL_INTERVAL_SECONDS
 * @param {string} param0.DEFAULT_CHANNEL
 */
export async function startChecker({ client, db, POLL_INTERVAL_SECONDS, DEFAULT_CHANNEL }) {
  console.log(`GitHub watcher started → polling every ${POLL_INTERVAL_SECONDS}s`);

  await checkAll({ client, db, DEFAULT_CHANNEL });
  setInterval(() => checkAll({ client, db, DEFAULT_CHANNEL }), POLL_INTERVAL_SECONDS * 1000);
}

/**
 * Main loop: iterate watches and delegate
 */
async function checkAll({ client, db, DEFAULT_CHANNEL }) {
  await db.read();
  db.data ||= {};
  db.data.watches ||= [];
  db.data.seenRepos ||= {};
  db.data.seenReleases ||= {};
  db.data.seenCommits ||= {};

  for (const watch of db.data.watches) {
    try {
      if (watch.type === "user") {
        await checkUserRepos({ client, db, watch, DEFAULT_CHANNEL });
      } else if (watch.type === "repo") {
        await checkRepoReleases({ client, db, watch, DEFAULT_CHANNEL });
        await checkRepoCommits({ client, db, watch, DEFAULT_CHANNEL });
      }
    } catch (err) {
      console.error("Checker error for watch", watch, err);
    }
  }

  await db.write();
}

/* -------------------------------
   USER: New repositories watcher
   ------------------------------- */
async function checkUserRepos({ client, db, watch, DEFAULT_CHANNEL }) {
  const username = watch.target;
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=50&sort=created`;

  const res = await fetch(url, { headers: { "User-Agent": "tenjiku-github-watcher" } });
  if (!res.ok) {
    console.warn(`Failed fetching repos for ${username}: ${res.status}`);
    return;
  }

  const repos = await res.json();
  if (!Array.isArray(repos)) return;

  db.data.seenRepos[username] ||= [];

  // oldest-first so announcements appear chronological
  for (const repo of repos.reverse()) {
    if (!db.data.seenRepos[username].includes(repo.full_name)) {
      await announceNewRepo({ client, watch, repo, DEFAULT_CHANNEL });
      db.data.seenRepos[username].push(repo.full_name);
    }
  }
}

/* -------------------------------
   REPO: Releases watcher
   ------------------------------- */
async function checkRepoReleases({ client, db, watch, DEFAULT_CHANNEL }) {
  const repo = watch.target;
  const url = `https://api.github.com/repos/${repo}/releases?per_page=10`;

  const res = await fetch(url, { headers: { "User-Agent": "tenjiku-github-watcher" } });
  if (!res.ok) {
    console.warn(`Failed fetching releases for ${repo}: ${res.status}`);
    return;
  }

  const releases = await res.json();
  if (!Array.isArray(releases)) return;

  db.data.seenReleases[repo] ||= [];

  for (const r of releases.reverse()) {
    if (!db.data.seenReleases[repo].includes(r.id)) {
      await announceRelease({ client, watch, release: r, DEFAULT_CHANNEL });
      db.data.seenReleases[repo].push(r.id);
    }
  }
}

/* -------------------------------
   REPO: Commits watcher (default branch) — grouped commits
   ------------------------------- */
async function checkRepoCommits({ client, db, watch, DEFAULT_CHANNEL }) {
  const repo = watch.target;

  // get repo info (to know default branch + metadata)
  const repoInfoUrl = `https://api.github.com/repos/${repo}`;
  const repoInfoRes = await fetch(repoInfoUrl, { headers: { "User-Agent": "tenjiku-github-watcher" } });
  if (!repoInfoRes.ok) {
    console.warn(`Failed fetching repo info for ${repo}: ${repoInfoRes.status}`);
    return;
  }
  const repoInfo = await repoInfoRes.json();
  const branch = repoInfo.default_branch || "main";

  // get recent commits on default branch
  const commitsUrl = `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`;
  const commitsRes = await fetch(commitsUrl, { headers: { "User-Agent": "tenjiku-github-watcher" } });
  if (!commitsRes.ok) {
    console.warn(`Failed fetching commits for ${repo}: ${commitsRes.status}`);
    return;
  }

  const commits = await commitsRes.json();
  if (!Array.isArray(commits)) return;

  db.data.seenCommits[repo] ||= [];

  // oldest-first
  for (const commitMeta of commits.reverse()) {
    const sha = commitMeta.sha;
    if (!db.data.seenCommits[repo].includes(sha)) {
      // fetch commit details
      const detailUrl = `https://api.github.com/repos/${repo}/commits/${sha}`;
      const detailRes = await fetch(detailUrl, { headers: { "User-Agent": "tenjiku-github-watcher" } });

      if (!detailRes.ok) {
        console.warn(`Failed fetching commit details ${repo}@${sha}: ${detailRes.status}`);
        // mark seen to avoid endless retries
        db.data.seenCommits[repo].push(sha);
        continue;
      }

      const commitDetail = await detailRes.json();

      // queue commit for grouping
      queueCommitForGrouping({
        repo,
        watch,
        repoInfo,
        commitMeta,
        commitDetail,
        DEFAULT_CHANNEL,
        client
      });

      // mark as seen
      db.data.seenCommits[repo].push(sha);
    }
  }
}

/* -------------------------------
   Grouping helpers
   ------------------------------- */
function queueCommitForGrouping({ repo, watch, repoInfo, commitMeta, commitDetail, DEFAULT_CHANNEL, client }) {
  const key = repo;
  const entry = {
    sha: commitMeta.sha,
    meta: commitMeta,
    detail: commitDetail,
    watch,
    repoInfo,
    DEFAULT_CHANNEL,
    client
  };

  if (!pendingCommits.has(key)) pendingCommits.set(key, []);
  pendingCommits.get(key).push(entry);

  if (!commitTimers.has(key)) {
    const timer = setTimeout(() => {
      flushGroupedCommits(key).catch(err => console.error("Error flushing grouped commits:", err));
    }, GROUP_WINDOW_MS);
    commitTimers.set(key, timer);
  }
}

async function flushGroupedCommits(key) {
  const batch = pendingCommits.get(key) || [];
  pendingCommits.delete(key);

  const timer = commitTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    commitTimers.delete(key);
  }

  if (!batch.length) return;

  // All entries share same repo
  const first = batch[0];
  const { repoInfo, watch, client, DEFAULT_CHANNEL } = first;
  const channelId = watch.channel || DEFAULT_CHANNEL;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const branch = repoInfo.default_branch || "main";

  // Build commit lines
  const commitLines = batch.map(e => {
    const sha = e.sha.slice(0, 7);
    const msg = e.detail.commit?.message?.split("\n")[0] || "(no message)";
    const shortMsg = msg.length > 80 ? msg.slice(0, 77) + "…" : msg;
    const author = e.detail.commit?.author?.name || e.detail.author?.login || "Unknown";
    return `• **${sha}** — ${shortMsg} _(by ${author})_`;
  });

  const embed = new EmbedBuilder()
    .setColor(BASE_EMBED_COLOR)
    .setAuthor({
      name: `${repoInfo.full_name} • ${batch.length} New Commit${batch.length > 1 ? "s" : ""}`,
      iconURL: repoInfo.owner?.avatar_url || null,
      url: repoInfo.html_url
    })
    .setTitle(`📝 ${batch.length} Commit${batch.length > 1 ? "s" : ""} on ${branch}`)
    .setURL(`${repoInfo.html_url}/commits/${branch}`)
    .setDescription(commitLines.join("\n"))
    .addFields(
      { name: "Repository", value: repoInfo.full_name, inline: true },
      { name: "Branch", value: branch, inline: true }
    )
    .setFooter({
      text: "Tenjiku Core — GitHub Watcher · Powered by Tenjiku Core (TJK)",
      // local path included here; your deployment tooling will convert it to a public URL
      iconURL: "https://cdn.discordapp.com/attachments/1433525801256751107/1433609547561308291/file_00000000aa246208bfad141abfbfe661.png?ex=6920572f&is=691f05af&hm=55bf21d860d5f85bc37091b5a5a8e31bb83187fe5f644b9bc3c1caa626769b65&"

    })
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("View Commits")
      .setURL(`${repoInfo.html_url}/commits/${branch}`)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel("Open Repo")
      .setURL(repoInfo.html_url)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel("Clone Repo")
      .setURL(`https://github.com/${repoInfo.full_name}.git`)
      .setStyle(ButtonStyle.Link)
  );

  const content = COMMIT_ROLE_ID ? `<@&${COMMIT_ROLE_ID}>` : null;

  await channel.send({ content, embeds: [embed], components: [row] }).catch(err => console.error("Failed to send grouped commit embed", err));
}

/* -------------------------------
   ANNOUNCERS: REPO + RELEASE (clean professional embeds)
   ------------------------------- */

/**
 * New repository announcer — clean professional embed
 */
export async function announceNewRepo({ client, watch, repo, DEFAULT_CHANNEL }) {
  const channelId = watch.channel || DEFAULT_CHANNEL;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const defaultBranch = repo.default_branch || "main";

  const tagList =
    Array.isArray(repo.topics) && repo.topics.length
      ? repo.topics.map(t => `\`${t}\``).join(" ")
      : "*No tags*";

  const embed = new EmbedBuilder()
    .setColor(BASE_EMBED_COLOR)
    .setAuthor({
      name: `${repo.owner.login} • New Repository`,
      iconURL: repo.owner.avatar_url,
      url: repo.owner.html_url
    })
    .setTitle(`🆕 ${repo.name}`)
    .setURL(repo.html_url)
    .setDescription(
      repo.description
        ? repo.description.length > 300
          ? repo.description.slice(0, 300) + "…"
          : repo.description
        : "*No description provided.*"
    )
    .addFields(
      {
        name: "📘 Repository Info",
        value: [
          `**Owner:** ${repo.owner.login}`,
          `**Language:** ${repo.language || "Unknown"}`,
          `**Stars:** ${repo.stargazers_count || 0}`,
          `**Created:** <t:${Math.floor(new Date(repo.created_at).getTime() / 1000)}:f>`,
          `**Updated:** <t:${Math.floor(new Date(repo.updated_at).getTime() / 1000)}:R>`
        ].join("\n"),
        inline: false
      },
      {
        name: "🏷️ Tags",
        value: tagList,
        inline: false
      }
    )
    .setThumbnail(repo.owner.avatar_url)
    .setFooter({
      text: "Tenjiku Core — GitHub Watcher · Powered by Tenjiku Core (TJK)",
      iconURL: "https://cdn.discordapp.com/attachments/1433525801256751107/1433609547561308291/file_00000000aa246208bfad141abfbfe661.png?ex=6920572f&is=691f05af&hm=55bf21d860d5f85bc37091b5a5a8e31bb83187fe5f644b9bc3c1caa626769b65&"

    })
    .setTimestamp(new Date(repo.created_at));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Open on GitHub")
      .setURL(repo.html_url)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel("Download ZIP")
      .setURL(`${repo.html_url}/archive/refs/heads/${defaultBranch}.zip`)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel("Clone Repo")
      .setURL(`https://github.com/${repo.full_name}.git`)
      .setStyle(ButtonStyle.Link)
  );

  await channel.send({ embeds: [embed], components: [row] }).catch(err => console.error("Failed to send repo announce", err));
}

/**
 * Release announcer — clean professional embed
 */
export async function announceRelease({ client, watch, release, DEFAULT_CHANNEL }) {
  const channelId = watch.channel || DEFAULT_CHANNEL;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const desc =
    release.body && release.body.length > 300
      ? release.body.slice(0, 300) + "…"
      : release.body || "*No release notes provided.*";

  const embed = new EmbedBuilder()
    .setColor(BASE_EMBED_COLOR)
    .setAuthor({
      name: `${watch.target} • New Release`,
      iconURL: "https://cdn.discordapp.com/attachments/1433525801256751107/1433609547561308291/file_00000000aa246208bfad141abfbfe661.png?ex=6920572f&is=691f05af&hm=55bf21d860d5f85bc37091b5a5a8e31bb83187fe5f644b9bc3c1caa626769b65&"

    })
    .setTitle(`🚀 ${release.name || release.tag_name}`)
    .setURL(release.html_url)
    .setDescription(desc)
    .addFields({
      name: "📦 Release Info",
      value: [
        `**Repository:** ${watch.target}`,
        `**Tag:** ${release.tag_name || "N/A"}`,
        `**Pre-release:** ${release.prerelease ? "Yes" : "No"}`,
        `**Published:** <t:${Math.floor(new Date(release.published_at).getTime() / 1000)}:f>`
      ].join("\n"),
      inline: false
    })
    .setFooter({
      text: "Tenjiku Core — GitHub Watcher · Powered by Tenjiku Core (TJK)",
      iconURL: "https://cdn.discordapp.com/attachments/1433525801256751107/1433609547561308291/file_00000000aa246208bfad141abfbfe661.png?ex=6920572f&is=691f05af&hm=55bf21d860d5f85bc37091b5a5a8e31bb83187fe5f644b9bc3c1caa626769b65&"

    })
    .setTimestamp(new Date(release.published_at));

  await channel.send({ embeds: [embed] }).catch(err => console.error("Failed to send release announce", err));
}
