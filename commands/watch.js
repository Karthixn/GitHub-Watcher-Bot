import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Manage GitHub watches")
    .addSubcommand(sub => sub
      .setName("add_user")
      .setDescription("Watch a GitHub user/org for new repositories")
      .addStringOption(o => o.setName("username").setDescription("GitHub username").setRequired(true))
      .addStringOption(o => o.setName("channel").setDescription("Channel ID").setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName("add_repo")
      .setDescription("Watch a GitHub repo for releases and commits")
      .addStringOption(o => o.setName("repo").setDescription("owner/repo").setRequired(true))
      .addStringOption(o => o.setName("channel").setDescription("Channel ID").setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName("remove")
      .setDescription("Remove a watch by ID")
      .addStringOption(o => o.setName("id").setDescription("watch id").setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName("list")
      .setDescription("List all watches")
    ),

  async execute({ interaction, db }) {
    await db.read();

    const sub = interaction.options.getSubcommand();

    if (sub === "add_user") {
      const username = interaction.options.getString("username");
      const channel = interaction.options.getString("channel") || null;
      const id = `user:${username.toLowerCase()}`;

      if (db.data.watches.find(w => w.id === id)) {
        return interaction.reply({ content: "Already watching this user.", ephemeral: true });
      }

      db.data.watches.push({ id, type: "user", target: username, channel });
      await db.write();

      return interaction.reply({ content: `Watching GitHub user **${username}**`, ephemeral: true });
    }

    if (sub === "add_repo") {
      const repo = interaction.options.getString("repo");
      const channel = interaction.options.getString("channel") || null;
      const id = `repo:${repo.toLowerCase()}`;

      if (db.data.watches.find(w => w.id === id)) {
        return interaction.reply({ content: "Already watching this repo.", ephemeral: true });
      }

      db.data.watches.push({ id, type: "repo", target: repo, channel });
      await db.write();

      return interaction.reply({ content: `Watching repo **${repo}**`, ephemeral: true });
    }

    if (sub === "remove") {
      const id = interaction.options.getString("id");
      const index = db.data.watches.findIndex(w => w.id === id);

      if (index === -1)
        return interaction.reply({ content: "Watch ID not found.", ephemeral: true });

      db.data.watches.splice(index, 1);
      await db.write();

      return interaction.reply({ content: `Removed **${id}**`, ephemeral: true });
    }

    if (sub === "list") {
      const watches = db.data.watches;
      if (!watches.length)
        return interaction.reply({ content: "No watches configured.", ephemeral: true });

      return interaction.reply({
        content: watches.map(w => `• **${w.id}** → ${w.target} (type: ${w.type}, channel: ${w.channel || "default"})`).join("\n"),
        ephemeral: true
      });
    }
  }
};
