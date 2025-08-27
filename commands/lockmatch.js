import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Team from '../models/Team.js';
import Match from '../models/Match.js';

function parseIsoDate(str) {
  const ms = Date.parse(str);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export default {
  data: new SlashCommandBuilder()
    .setName('lockmatch')
    .setDescription('Admin: Manually lock or unlock a match for tipping')
    .addStringOption(o =>
      o.setName('action')
        .setDescription('Lock or unlock')
        .addChoices(
          { name: 'Lock',   value: 'lock' },
          { name: 'Unlock', value: 'unlock' },
        )
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('match_id')
        .setDescription('Match ID (alternative to team/start)')
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('team_a')
        .setDescription('Team A name (if not using match_id)')
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('team_b')
        .setDescription('Team B name (if not using match_id)')
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('start')
        .setDescription('Start time ISO8601 (if not using match_id)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }

    const action    = interaction.options.getString('action');
    const matchId   = interaction.options.getString('match_id')?.trim() || null;
    const teamAName = interaction.options.getString('team_a')?.trim() || null;
    const teamBName = interaction.options.getString('team_b')?.trim() || null;
    const startStr  = interaction.options.getString('start')?.trim() || null;

    await interaction.deferReply({ flags: 64 });

    try {
      let match;

      if (matchId) {
        match = await Match.findById(matchId).populate('teamA teamB');
        if (!match) return interaction.editReply(`❌ No match found with ID: \`${matchId}\`.`);
      } else {
        if (!teamAName || !teamBName || !startStr) {
          return interaction.editReply('❌ Provide `match_id` OR all of `team_a`, `team_b`, and `start` (ISO8601).');
        }
        const [teamA, teamB] = await Promise.all([
          Team.findOne({ name: new RegExp(`^${teamAName}$`, 'i') }),
          Team.findOne({ name: new RegExp(`^${teamBName}$`, 'i') }),
        ]);
        if (!teamA) return interaction.editReply(`❌ Team "${teamAName}" not found.`);
        if (!teamB) return interaction.editReply(`❌ Team "${teamBName}" not found.`);
        const startTime = parseIsoDate(startStr);
        if (!startTime) return interaction.editReply('❌ Invalid `start`. Use ISO8601 like `2025-10-21T17:00:00Z`.');
        match = await Match.findOne({ teamA: teamA._id, teamB: teamB._id, startTime }).populate('teamA teamB');
        if (!match) return interaction.editReply('❌ No match found with those teams and start time.');
      }

      if (action === 'lock') {
        if (match.status === 'completed') return interaction.editReply('⚠️ Completed match cannot be locked.');
        match.status = 'locked';
      } else {
        if (match.status === 'completed') return interaction.editReply('⚠️ Completed match cannot be unlocked.');
        match.status = 'scheduled';
      }

      await match.save();
      return interaction.editReply(
        `✅ ${action === 'lock' ? 'Locked' : 'Unlocked'}: **${match.teamA.name} vs ${match.teamB.name}** ` +
        `(${match.startTime.toISOString()}) — status **${match.status}**.`
      );
    } catch (err) {
      console.error('Error locking/unlocking match:', err);
      return interaction.editReply('❌ Failed to update match lock state.');
    }
  }
};