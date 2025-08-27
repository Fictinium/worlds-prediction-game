import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Team from '../models/Team.js';
import Match from '../models/Match.js';

function parseIsoDate(str) {
  // Only allow valid ISO8601; Date.parse returns NaN if invalid
  const ms = Date.parse(str);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export default {
  data: new SlashCommandBuilder()
    .setName('addmatch')
    .setDescription('Admin: Create a match between two teams')
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
        .setDescription('Start time (ISO8601, e.g. 2025-10-21T17:00:00Z)')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('phase')
        .setDescription('Tournament phase')
        .addChoices(
          { name: 'Group Stage', value: 'group_stage' },
          { name: 'Top 4', value: 'top_4' },
          { name: 'Finals', value: 'finals' },
        )
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('bestof')
        .setDescription('Best of (default 1)')
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }

    const teamAName = interaction.options.getString('team_a').trim();
    const teamBName = interaction.options.getString('team_b').trim();
    const startStr   = interaction.options.getString('start').trim();
    const phase      = interaction.options.getString('phase');
    const bestOf     = interaction.options.getInteger('bestof') ?? 1;

    await interaction.deferReply({ flags: 64 });

    try {
      if (teamAName.toLowerCase() === teamBName.toLowerCase()) {
        return interaction.editReply('❌ Team A and Team B must be different.');
      }

      const [teamA, teamB] = await Promise.all([
        Team.findOne({ name: new RegExp(`^${teamAName}$`, 'i') }),
        Team.findOne({ name: new RegExp(`^${teamBName}$`, 'i') }),
      ]);

      if (!teamA) return interaction.editReply(`❌ Team "${teamAName}" not found.`);
      if (!teamB) return interaction.editReply(`❌ Team "${teamBName}" not found.`);

      const startTime = parseIsoDate(startStr);
      if (!startTime) {
        return interaction.editReply('❌ Invalid date. Please provide ISO8601, e.g. `2025-10-21T17:00:00Z`.');
      }

      const lockAt = new Date(startTime.getTime() - 2 * 60 * 60 * 1000); // start - 2h

      // Optional: avoid accidental duplicates (same teams + start time)
      const dup = await Match.findOne({
        teamA: teamA._id,
        teamB: teamB._id,
        startTime,
      });
      if (dup) {
        return interaction.editReply('⚠️ A match with these teams at this time already exists.');
      }

      const match = await Match.create({
        teamA: teamA._id,
        teamB: teamB._id,
        startTime,
        phase,
        bestOf,
        lockAt,
      });

      const fmt = (d) => `\`${d.toISOString()}\``;
      return interaction.editReply(
        `✅ Match created:\n• ${teamA.name} vs ${teamB.name}\n` +
        `• Phase: **${phase.replace('_', ' ')}**\n` +
        `• Best of: **${bestOf}**\n` +
        `• Starts: ${fmt(startTime)}\n` +
        `• Tips lock at: ${fmt(lockAt)}`
      );
    } catch (err) {
      console.error('Error creating match:', err);
      return interaction.editReply('❌ Failed to create match.');
    }
  }
};