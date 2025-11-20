import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { startChecker } from './githubChecker.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 120);
const TOKEN = process.env.DISCORD_TOKEN;
const DEFAULT_CHANNEL = process.env.DEFAULT_ANNOUNCE_CHANNEL_ID || null;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

// === LOWDB SETUP =================================================
const dbFile = path.join(__dirname, 'storage', 'db.json');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

await db.read();
db.data ||= { watches: [], seenRepos: {}, seenReleases: {}, seenCommits: {} };
await db.write();

// === DISCORD CLIENT ==============================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();

// === LOAD COMMANDS SAFELY USING file:// URLs =====================
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const files = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const fullPath = path.join(commandsPath, file);
    const fileURL = pathToFileURL(fullPath).href; // FIXED
    const { default: cmd } = await import(fileURL);

    client.commands.set(cmd.data.name, cmd);
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  startChecker({ client, db, POLL_INTERVAL_SECONDS, DEFAULT_CHANNEL });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute({ interaction, db, client });
  } catch (err) {
    console.error(err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Error executing command.", ephemeral: true });
    } else {
      await interaction.reply({ content: "Error executing command.", ephemeral: true });
    }
  }
});

client.login(TOKEN);
