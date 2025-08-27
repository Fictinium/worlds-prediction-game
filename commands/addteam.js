import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
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
    )
    /*.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)*/,

  async execute(interaction) {
    /*if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }*/

    const name = interaction.options.getString('name').trim();
    const region = interaction.options.getString('region').trim();

    // Respond fast so the token doesn’t expire:
    await interaction.deferReply({ flags: 64 });

    try {
      // Check if team already exists
      const existing = await Team.findOne({ name: new RegExp(`^${name}$`, 'i') });
      if (existing) {
        return interaction.editReply(`Team "${name}" already exists.`);
      }

      await new Team({ name, region }).save();
      return interaction.editReply(`✅ Team **${name}** (${region}) added successfully.`);
    } catch (err) {
      console.error('Error adding team:', err);
      // still edit the deferred reply
      try {
        return await interaction.editReply('❌ Failed to add team.');
      } catch {
        // if somehow already edited, use followUp as a fallback
        return interaction.followUp({ content: '❌ Failed to add team.', flags: 64 });
      }
    }
  }
};