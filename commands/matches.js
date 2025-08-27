import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import Match from '../models/Match.js';

const PAGE_SIZE = 10;

function statusEmoji(m) {
  if (m.status === 'completed') return '✅';
  if (new Date() >= new Date(m.lockAt) || m.status === 'locked') return '🔒';
  return '🕒';
}
function matchLine(m) {
  const base = `${statusEmoji(m)} **${m.teamA.name} vs ${m.teamB.name}** (${new Date(m.startTime).toISOString()})`;
  return m.status === 'completed' ? `${base} — Final: ${m.scoreA}-${m.scoreB}` : base;
}

export default {
  data: new SlashCommandBuilder()
    .setName('matches')
    .setDescription('Browse matches with pagination')
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
    .addStringOption(o =>
      o.setName('phase')
        .setDescription('Phase to show')
        .addChoices(
          { name: 'Group Stage', value: 'group_stage' },
          { name: 'Top 4',       value: 'top_4' },
          { name: 'Finals',      value: 'finals' },
        )
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName('ephemeral')
        .setDescription('Show only to you (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const filter = interaction.options.getString('filter') ?? 'upcoming';
    const phase  = interaction.options.getString('phase') ?? null;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    await interaction.deferReply({ flags: ephemeral ? 64 : undefined });

    try {
      const now = new Date();
      const query = {};
      if (filter === 'upcoming') {
        query.status = { $in: ['scheduled', 'locked'] };
        query.startTime = { $gte: now };
      } else if (filter === 'completed') {
        query.status = 'completed';
      }
      if (phase) query.phase = phase;

      const matches = await Match.find(query)
        .populate('teamA teamB')
        .sort({ startTime: 1 })
        .lean();

      if (!matches.length) {
        return interaction.editReply('No matches found with that filter.');
      }

      const total = matches.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      let page = 0;

      const pageSlice = (p) => {
        const start = p * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);
        return matches.slice(start, end);
      };

      const buildEmbed = (p) => {
        const list = pageSlice(p).map(matchLine).join('\n');
        const titleFilter = filter.charAt(0).toUpperCase() + filter.slice(1);
        const titlePhase = phase ? ` — ${phase.replace('_', ' ')}` : '';
        return new EmbedBuilder()
          .setTitle(`📅 Matches (${titleFilter}${titlePhase})`)
          .setDescription(list)
          .setFooter({ text: `Page ${p + 1}/${totalPages} • ${total} match(es)` });
      };

      const buildRows = (p) => {
        const prevPageBtn = new ButtonBuilder()
          .setCustomId(`m_prevpage_${interaction.id}`)
          .setLabel('« Prev Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0);

        const nextPageBtn = new ButtonBuilder()
          .setCustomId(`m_nextpage_${interaction.id}`)
          .setLabel('Next Page »')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p >= totalPages - 1);

        // Show up to 25 page options (Discord limit). Window them if many pages.
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
          .setCustomId(`m_select_${interaction.id}`)
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
          i.customId === `m_select_${interaction.id}` ||
          i.customId === `m_prevpage_${interaction.id}` ||
          i.customId === `m_nextpage_${interaction.id}`
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
            if (i.customId === `m_prevpage_${interaction.id}` && page > 0) page -= 1;
            if (i.customId === `m_nextpage_${interaction.id}` && page < totalPages - 1) page += 1;
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
      console.error('matches (paginated) error:', err);
      return interaction.editReply('❌ Failed to fetch matches.');
    }
  }
};