import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import User from '../models/User.js';
import Prediction from '../models/Prediction.js';
import Match from '../models/Match.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mypredictions')
    .setDescription('See your submitted match predictions'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }); // private by default

    try {
      const user = await User.findOne({ discordId: interaction.user.id });
      if (!user) return interaction.editReply('You have no predictions yet.');

      const preds = await Prediction.find({ user: user._id })
        .populate({ path: 'match', populate: ['teamA', 'teamB'] })
        .sort({ createdAt: -1 })
        .lean();

      if (!preds.length) {
        return interaction.editReply('You haven’t made any predictions yet.');
      }

      const lines = preds.map(p => {
        const m = p.match;
        if (!m) return null;

        const base = `**${m.teamA.name} vs ${m.teamB.name}** (${m.startTime.toISOString()})`;
        const pick = `Your pick: ${p.scoreA}-${p.scoreB}`;
        const result = m.status === 'completed'
          ? `Final: ${m.scoreA}-${m.scoreB} → ${p.points} pts`
          : `(pending)`;
        return `${base}\n→ ${pick} | ${result}`;
      }).filter(Boolean);

      const embed = new EmbedBuilder()
        .setTitle(`📑 Predictions for ${interaction.user.username}`)
        .setDescription(lines.slice(0, 10).join('\n\n'))
        .setFooter({ text: `Showing up to 10 recent predictions` });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('mypredictions error:', err);
      return interaction.editReply('❌ Failed to fetch your predictions.');
    }
  }
};