import './models/modelsIndex.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Collection, Events, REST, Routes, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import os from 'os';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Discord client with appropriate intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
client.commands = new Collection();

// Load slash commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commandsArray = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;

  try {
    const { default: command } = await import(fileUrl);
    if (!command?.data?.name || typeof command.execute !== 'function') {
      console.warn(`Skipped "${file}" - missing data.name or execute()`);
      continue;
    }
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
    console.log(`Loaded command: ${command.data.name}`);
  } catch (err) {
    console.error(`Error loading command file "${file}":`, err);
  }
}

// MongoDB connection
const mongoUri = process.env.MONGO_URI;
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(error => console.error('MongoDB connection error:', error));

// Discord login and command registration
const token = process.env.TOKEN;

client.once(Events.ClientReady, async c => {
  console.log(`[READY] Logged in as ${c.user.tag} on ${os.hostname()} (pid ${process.pid})`);
  c.user.setPresence({ activities: [{ name: 'Worlds Predictions' }], status: 'online' });

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`Registering ${commandsArray.length} application commands...`);
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: commandsArray
    });
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Interaction handling
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const payload = {
        content: 'There was an error executing this command!',
        flags: 64
      };
      try {
        if (interaction.deferred) await interaction.editReply(payload);
        else if (!interaction.replied) await interaction.reply(payload);
        else await interaction.followUp(payload);
      } catch {}
    }
  }
});

client.login(token);