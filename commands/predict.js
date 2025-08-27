import { SlashCommandBuilder } from 'discord.js';
import Team from '../models/Team.js';
import Match from '../models/Match.js';
import Prediction from '../models/Prediction.js';
import User from '../models/User.js';

function parseIsoDate(str) {
  const ms = Date.parse(str);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export default {
  data: new SlashCommandBuilder()
    .setName('predict')
    .setDescription('Submit or update your prediction for a match')
    .addStringOption(o =>
      o.setName('team_a')
        .setDescription('Team A name')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('team_b')
        .setDescription('Team B name')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('start')
        .setDescription('Match start time (ISO8601, e.g. 2025-10-21T17:00:00Z)')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('score_a')
        .setDescription('Predicted score for Team A')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('score_b')
        .setDescription('Predicted score for Team B')
        .setRequired(true)
    ),

  async execute(interaction) {
    const teamAName = interaction.options.getString('team_a').trim();
    const teamBName = interaction.options.getString('team_b').trim();
    const startStr  = interaction.options.getString('start').trim();
    const scoreA    = interaction.options.getInteger('score_a');
    const scoreB    = interaction.options.getInteger('score_b');

    await interaction.deferReply({ flags: 64 });

    try {
      const [teamA, teamB] = await Promise.all([
        Team.findOne({ name: new RegExp(`^${teamAName}$`, 'i') }),
        Team.findOne({ name: new RegExp(`^${teamBName}$`, 'i') }),
      ]);
      if (!teamA) return interaction.editReply(`❌ Team "${teamAName}" not found.`);
      if (!teamB) return interaction.editReply(`❌ Team "${teamBName}" not found.`);

      const startTime = parseIsoDate(startStr);
      if (!startTime) {
        return interaction.editReply('❌ Invalid `start`. Use ISO8601 like `2025-10-21T17:00:00Z`.');
      }

      const match = await Match.findOne({ teamA: teamA._id, teamB: teamB._id, startTime }).populate('teamA teamB');
      if (!match) return interaction.editReply('❌ Match not found with those teams and start time.');

      if (match.status === 'completed') {
        return interaction.editReply('❌ This match is already completed. You can’t tip it.');
      }

      const now = new Date();
      if (now >= match.lockAt || match.status === 'locked') {
        return interaction.editReply(`🔒 Predicting closed for this match (locked at ${match.lockAt.toISOString()}).`);
      }

      // Upsert user
      const user = await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        { $setOnInsert: { discordId: interaction.user.id, username: interaction.user.tag } },
        { upsert: true, new: true }
      );

      // Upsert prediction
      const pred = await Prediction.findOneAndUpdate(
        { user: user._id, match: match._id },
        { $set: { scoreA, scoreB } },
        { upsert: true, new: true }
      );

      return interaction.editReply(
        `✅ Your prediction for **${match.teamA.name} vs ${match.teamB.name}** ` +
        `(${match.startTime.toISOString()}): **${scoreA}–${scoreB}**`
      );
    } catch (err) {
      console.error('Prediction error:', err);
      return interaction.editReply('❌ Failed to save your prediction.');
    }
  }
};