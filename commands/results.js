import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import Match from '../models/Match.js';
import Prediction from '../models/Prediction.js';
import User from '../models/User.js';

function parseIsoDate(str) {
  const ms = Date.parse(str);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function pointsFor(predA, predB, realA, realB) {
  const exact = predA === realA && predB === realB;
  if (exact) return 2;
  const predOutcome = Math.sign(predA - predB); // 1 A wins, -1 B wins, 0 tie
  const realOutcome = Math.sign(realA - realB);
  return predOutcome === realOutcome ? 1 : 0;
}

export default {
  data: new SlashCommandBuilder()
    .setName('results')
    .setDescription('Admin: Set final score for a match and award points')
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
    .addIntegerOption(o =>
      o.setName('score_a')
        .setDescription('Final score for Team A')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('score_b')
        .setDescription('Final score for Team B')
        .setRequired(true)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */

    const matchId   = interaction.options.getString('match_id')?.trim() || null;
    const teamAName = interaction.options.getString('team_a')?.trim() || null;
    const teamBName = interaction.options.getString('team_b')?.trim() || null;
    const startStr  = interaction.options.getString('start')?.trim() || null;
    const scoreA    = interaction.options.getInteger('score_a');
    const scoreB    = interaction.options.getInteger('score_b');

    await interaction.deferReply({ flags: 64 });

    try {
      let match;
      if (matchId) {
        match = await Match.findById(matchId).populate('teamA teamB');
        if (!match) return interaction.editReply(`❌ No match found with ID: \`${matchId}\`.`);
      } else {
        if (!teamAName || !teamBName || !startStr) {
          return interaction.editReply('❌ Provide `match_id` **or** all of `team_a`, `team_b`, and `start` (ISO8601).');
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

      // Update match result
      match.scoreA = scoreA;
      match.scoreB = scoreB;
      match.status = 'completed';
      await match.save();

      // Fetch all predictions for this match
      const preds = await Prediction.find({ match: match._id });
      if (preds.length === 0) {
        return interaction.editReply(
          `✅ Result saved for **${match.teamA.name} ${scoreA}–${scoreB} ${match.teamB.name}**. (No predictions to score.)`
        );
      }

      // Score predictions (idempotent: apply delta to users)
      let totalAwarded = 0;
      for (const p of preds) {
        const newPts = pointsFor(p.scoreA, p.scoreB, scoreA, scoreB);
        const delta = newPts - (p.points || 0);

        if (delta !== 0) {
          // Update prediction points
          p.points = newPts;
          await p.save();

          // Upsert user and apply delta totals
          const user = await User.findOneAndUpdate(
            { discordId: p.user.toString() }, // NOTE: we stored ObjectId for user earlier? If you prefer, store discordId directly in Prediction to avoid this.
            { $setOnInsert: { discordId: p.user.toString(), username: 'unknown' } },
            { upsert: true, new: true }
          );

          // Update totals
          user.totalPoints = (user.totalPoints || 0) + delta;
          const ph = match.phase; // 'group_stage' | 'top_4' | 'finals'
          if (!user.phasePoints) user.phasePoints = {};
          user.phasePoints[ph] = (user.phasePoints[ph] || 0) + delta;
          await user.save();

          totalAwarded += delta;
        }
      }

      return interaction.editReply(
        `✅ Result saved and scored: **${match.teamA.name} ${scoreA}–${scoreB} ${match.teamB.name}**.\n` +
        `Awarded a total of **${totalAwarded}** point(s) across ${preds.length} prediction(s).`
      );
    } catch (err) {
      console.error('Error saving results / scoring:', err);
      return interaction.editReply('❌ Failed to save results and score predictions.');
    }
  }
};