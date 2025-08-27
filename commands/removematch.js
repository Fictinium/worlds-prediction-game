import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import Match from '../models/Match.js';
import Prediction from '../models/Prediction.js';

function parseIsoDate(str) { const ms = Date.parse(str); return Number.isNaN(ms) ? null : new Date(ms); }

export default {
  data: new SlashCommandBuilder()
    .setName('removematch')
    .setDescription('Admin: Remove a match and its predictions')
    .addStringOption(o => o.setName('match_id').setDescription('Match ID (alternative to team/start)').setRequired(false))
    .addStringOption(o => o.setName('team_a').setDescription('Team A (if not using match_id)').setRequired(false))
    .addStringOption(o => o.setName('team_b').setDescription('Team B (if not using match_id)').setRequired(false))
    .addStringOption(o => o.setName('start').setDescription('Start time ISO8601 (if not using match_id)').setRequired(false))
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */
    await interaction.deferReply({ flags: 64 });

    const matchId  = interaction.options.getString('match_id')?.trim() || null;
    const teamAName = interaction.options.getString('team_a')?.trim() || null;
    const teamBName = interaction.options.getString('team_b')?.trim() || null;
    const startStr  = interaction.options.getString('start')?.trim() || null;

    let match;

    if (matchId) {
      match = await Match.findById(matchId);
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

      match = await Match.findOne({ teamA: teamA._id, teamB: teamB._id, startTime });
      if (!match) return interaction.editReply('❌ No match found with those teams and start time.');
    }

    const predRes = await Prediction.deleteMany({ match: match._id });
    const delRes  = await Match.deleteOne({ _id: match._id });

    return interaction.editReply(
      `🗑️ Deleted match \`${match._id}\`\n` +
      `• Predictions removed: ${predRes.deletedCount || 0}\n` +
      `• Matches removed: ${delRes.deletedCount || 0}`
    );
  }
};