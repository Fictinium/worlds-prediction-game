import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Player from '../models/Player.js';
import Team from '../models/Team.js';

export default {
  data: new SlashCommandBuilder()
    .setName('addplayer')
    .setDescription('Admin: Add a new player to a team')
    .addStringOption(o =>
      o.setName('name')
        .setDescription('Player name')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('role')
        .setDescription('Player role (Top, Jungle, Mid, ADC, Support)')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('team')
        .setDescription('Team name')
        .setRequired(true)
    )
    /*.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)*/,

  async execute(interaction) {
    /*if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }*/

    const name = interaction.options.getString('name').trim();
    const role = interaction.options.getString('role').trim();
    const teamName = interaction.options.getString('team').trim();

    await interaction.deferReply({ flags: 64 });

    try {
      const team = await Team.findOne({ name: new RegExp(`^${teamName}$`, 'i') });
      if (!team) {
        return interaction.editReply(`❌ Team "${teamName}" not found. Please add it first with /addteam.`);
      }

      const existing = await Player.findOne({ name: new RegExp(`^${name}$`, 'i'), team: team._id });
      if (existing) {
        return interaction.editReply(`Player "${name}" is already registered for ${team.name}.`);
      }

      await new Player({ name, role, team: team._id }).save();
      return interaction.editReply(`✅ Player **${name}** (${role}) added to **${team.name}**.`);
    } catch (err) {
      console.error('Error adding player:', err);
      return interaction.editReply('❌ Failed to add player.');
    }
  }
};