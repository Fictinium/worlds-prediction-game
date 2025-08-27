import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Team from '../models/Team.js';
import Player from '../models/Player.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removeplayer')
    .setDescription('Admin: Remove a player from a team')
    // Either provide player_id...
    .addStringOption(o =>
      o.setName('player_id')
        .setDescription('Player ID to delete (alternative to name/team)')
        .setRequired(false)
    )
    // ...or both name and team (exact names, case-insensitive)
    .addStringOption(o =>
      o.setName('name')
        .setDescription('Player name (if not using player_id)')
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('team')
        .setDescription('Team name (if not using player_id)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }

    const playerId = interaction.options.getString('player_id')?.trim() || null;
    const name = interaction.options.getString('name')?.trim() || null;
    const teamName = interaction.options.getString('team')?.trim() || null;

    await interaction.deferReply({ flags: 64 });

    try {
      let player;

      if (playerId) {
        player = await Player.findById(playerId).populate('team');
        if (!player) return interaction.editReply(`❌ No player found with ID: \`${playerId}\`.`);
      } else {
        if (!name || !teamName) {
          return interaction.editReply('❌ Provide `player_id` **or** both `name` and `team`.');
        }

        const team = await Team.findOne({ name: new RegExp(`^${teamName}$`, 'i') });
        if (!team) return interaction.editReply(`❌ Team "${teamName}" not found.`);

        player = await Player.findOne({
          name: new RegExp(`^${name}$`, 'i'),
          team: team._id,
        }).populate('team');

        if (!player) {
          return interaction.editReply(`❌ Player "${name}" not found in **${team.name}**.`);
        }
      }

      const del = await Player.deleteOne({ _id: player._id });

      if (del.deletedCount === 0) {
        return interaction.editReply('⚠️ Player was not deleted (already removed?).');
      }

      return interaction.editReply(`🗑️ Removed player **${player.name}** from **${player.team?.name || 'unknown team'}**.`);
    } catch (err) {
      console.error('removeplayer error:', err);
      return interaction.editReply('❌ Failed to remove player.');
    }
  }
};
