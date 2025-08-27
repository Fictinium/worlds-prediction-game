import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import User from '../models/User.js';
import Prediction from '../models/Prediction.js';

const PAGE_SIZE = 10;

function lineForPrediction(p) {
  const m = p.match;
  if (!m) return null;

  const when = new Date(m.startTime).toISOString();
  const base = `**${m.teamA.name} vs ${m.teamB.name}** (${when})`;
  const pick = `Your pick: ${p.scoreA}-${p.scoreB}`;
  const result = m.status === 'completed'
    ? `Final: ${m.scoreA}-${m.scoreB} → ${p.points ?? 0} pts`
    : (new Date() >= new Date(m.lockAt) || m.status === 'locked') ? '🔒 (locked)' : '🕒 (open)';
  return `${base}\n→ ${pick} | ${result}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('mypredictions')
    .setDescription('See your submitted match predictions (paginated)')
    .addBooleanOption(o =>
      o.setName('ephemeral')
        .setDescription('Show only to you (default: true)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const ephemeral = interaction.options.getBoolean('ephemeral');
    const flags = (ephemeral === false) ? undefined : 64; // default private

    await interaction.deferReply({ flags });

    try {
      const user = await User.findOne({ discordId: interaction.user.id });
      if (!user) return interaction.editReply('You have no predictions yet.');

      // Load ALL predictions for this user; sort by match startTime desc for a sensible timeline
      const preds = await Prediction.find({ user: user._id })
        .populate({ path: 'match', populate: ['teamA', 'teamB'] })
        .lean();

      // Remove any entries with missing match (deleted/cleanup)
      const clean = preds.filter(p => p.match && p.match.teamA && p.match.teamB);

      // Sort newest matches first
      clean.sort((a, b) => new Date(b.match.startTime) - new Date(a.match.startTime));

      if (!clean.length) {
        return interaction.editReply('You haven’t made any predictions yet.');
      }

      const total = clean.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      let page = 0;

      const pageSlice = (p) => {
        const start = p * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);
        return clean.slice(start, end);
      };

      const buildEmbed = (p) => {
        const lines = pageSlice(p).map(lineForPrediction).filter(Boolean);
        return new EmbedBuilder()
          .setTitle(`📑 Predictions — ${interaction.user.username}`)
          .setDescription(lines.join('\n\n'))
          .setFooter({ text: `Page ${p + 1}/${totalPages} • ${total} prediction(s)` });
      };

      const buildRows = (p) => {
        const prevPageBtn = new ButtonBuilder()
          .setCustomId(`mp_prev_${interaction.id}`)
          .setLabel('« Prev Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0);

        const nextPageBtn = new ButtonBuilder()
          .setCustomId(`mp_next_${interaction.id}`)
          .setLabel('Next Page »')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p >= totalPages - 1);

        // Show up to 25 pages in the selector window
        const windowSize = 25;
        const windowStart = Math.floor(p / windowSize) * windowSize;
        const windowEnd = Math.min(windowStart + windowSize, totalPages);

        const options = [];
        for (let i = windowStart; i < windowEnd; i++) {
          options.push({
            label: `Page ${i + 1}`,
            value: String(i),
            default: i === p,
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`mp_sel_${interaction.id}`)
          .setPlaceholder(`Jump to page (${p + 1}/${totalPages})`)
          .addOptions(options);

        return [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(prevPageBtn, nextPageBtn),
        ];
      };

      const message = await interaction.editReply({
        embeds: [buildEmbed(page)],
        components: buildRows(page),
      });

      const filterFn = (i) =>
        i.user.id === interaction.user.id &&
        (
          i.customId === `mp_sel_${interaction.id}` ||
          i.customId === `mp_prev_${interaction.id}` ||
          i.customId === `mp_next_${interaction.id}`
        );

      const collector = message.createMessageComponentCollector({
        filter: filterFn,
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async (i) => {
        try {
          if (i.isStringSelectMenu()) {
            const target = parseInt(i.values[0], 10);
            if (!Number.isNaN(target)) page = Math.min(Math.max(target, 0), totalPages - 1);
          } else if (i.isButton()) {
            if (i.customId === `mp_prev_${interaction.id}` && page > 0) page -= 1;
            if (i.customId === `mp_next_${interaction.id}` && page < totalPages - 1) page += 1;
          }

          await i.update({
            embeds: [buildEmbed(page)],
            components: buildRows(page),
          });
        } catch (err) {
          console.error(err);
          try { await i.deferUpdate(); } catch {}
        }
      });

      collector.on('end', async () => {
        try { await message.edit({ components: [] }); } catch {}
      });
    } catch (err) {
      console.error('mypredictions (paginated) error:', err);
      return interaction.editReply('❌ Failed to fetch your predictions.');
    }
  }
};