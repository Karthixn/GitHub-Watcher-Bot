import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing DISCORD_TOKEN or CLIENT_ID");
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(process.cwd(), 'commands');

// READ COMMAND FILES
if (fs.existsSync(commandsDir)) {
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const fullPath = path.join(commandsDir, file);

    // Convert to file:// URL — FIX
    const fileURL = pathToFileURL(fullPath).href;

    const { default: cmd } = await import(fileURL);

    if (cmd.data) commands.push(cmd.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    if (GUILD_ID) {
      console.log("Registering commands to guild:", GUILD_ID);

      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
    } else {
      console.log("Registering commands globally... (may take up to 1 hour)");

      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
    }

    console.log("Commands registered successfully.");
  } catch (err) {
    console.error(err);
  }
})();
