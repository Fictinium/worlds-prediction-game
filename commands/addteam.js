import { SlashCommandBuilder } from 'discord.js';
import Team from '../models/Team.js';

export default {
  data: new SlashCommandBuilder()
    .setName('addteam')
    .setDescription('Admin: Add a new team')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Team name')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region of the team (e.g., EU, NA, KR)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name').trim();
    const region = interaction.options.getString('region').trim();

    // Respond fast so the token doesn’t expire:
    await interaction.deferReply({ flags: 64 }); // 64 = ephemeral (use flags instead of ephemeral: true)

    try {
      // Check if team already exists
      const existing = await Team.findOne({ name: new RegExp(`^${name}$`, 'i') });
      if (existing) {
        return interaction.reply({ content: `Team "${name}" already exists.`, ephemeral: true });
      }

      const newTeam = new Team({ name, region });
      await newTeam.save();

      return interaction.reply({ content: `✅ Team **${name}** (${region}) added successfully.`, ephemeral: true });
    } catch (err) {
      console.error('Error adding team:', err);
      return interaction.reply({ content: '❌ Failed to add team.', ephemeral: true });
    }
  }
};