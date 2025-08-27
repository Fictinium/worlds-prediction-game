import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Match from '../models/Match.js';
import Team from '../models/Team.js';

export default {
  data: new SlashCommandBuilder()
    .setName('matches')
    .setDescription('List matches with status')
    .addStringOption(o =>
      o.setName('filter')
        .setDescription('Filter matches')
        .addChoices(
          { name: 'Upcoming', value: 'upcoming' },
          { name: 'Completed', value: 'completed' },
          { name: 'All', value: 'all' },
        )
        .setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('limit')
        .setDescription('Number of matches to show (default 10)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const filter = interaction.options.getString('filter') ?? 'upcoming';
    const limit = interaction.options.getInteger('limit') ?? 10;

    await interaction.deferReply();

    try {
      let query = {};
      const now = new Date();

      if (filter === 'upcoming') {
        query = { status: { $in: ['scheduled', 'locked'] }, startTime: { $gte: now } };
      } else if (filter === 'completed') {
        query = { status: 'completed' };
      }

      const matches = await Match.find(query)
        .populate('teamA teamB')
        .sort({ startTime: 1 })
        .limit(limit)
        .lean();

      if (!matches.length) {
        return interaction.editReply('No matches found with that filter.');
      }

      const lines = matches.map(m => {
        const statusEmoji =
          m.status === 'completed' ? '✅' :
          (new Date() >= m.lockAt || m.status === 'locked') ? '🔒' : '🕒';

        const scoreText = m.status === 'completed'
          ? ` — Final: ${m.scoreA}-${m.scoreB}`
          : '';

        return `${statusEmoji} **${m.teamA.name} vs ${m.teamB.name}** (${m.startTime.toISOString()})${scoreText}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📅 Matches (${filter})`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Showing up to ${matches.length} matches` });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('matches error:', err);
      return interaction.editReply('❌ Failed to fetch matches.');
    }
  }
};