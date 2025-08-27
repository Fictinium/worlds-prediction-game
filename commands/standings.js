import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import User from '../models/User.js';

export default {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Show the leaderboard')
    .addIntegerOption(o =>
      o.setName('limit')
        .setDescription('How many players to show (default 10)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;

    await interaction.deferReply();

    try {
      const users = await User.find().sort({ totalPoints: -1 }).limit(limit).lean();
      if (!users.length) return interaction.editReply('No standings available yet.');

      const lines = users.map((u, i) =>
        `**${i + 1}.** ${u.username || u.discordId} — ${u.totalPoints} pts`
      );

      const embed = new EmbedBuilder()
        .setTitle('🏆 Leaderboard')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Top ${users.length}` });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('standings error:', err);
      return interaction.editReply('❌ Failed to fetch standings.');
    }
  }
};