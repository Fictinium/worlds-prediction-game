import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import Match from '../models/Match.js';

const PAGE_SIZE = 10; // how many matches per page

function statusEmoji(m) {
  if (m.status === 'completed') return '✅';
  if (new Date() >= new Date(m.lockAt) || m.status === 'locked') return '🔒';
  return '🕒';
}

function matchLine(m) {
  const base = `${statusEmoji(m)} **${m.teamA.name} vs ${m.teamB.name}** (${new Date(m.startTime).toISOString()})`;
  if (m.status === 'completed') return `${base} — Final: ${m.scoreA}-${m.scoreB}`;
  return base;
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
      // Build query
      const now = new Date();
      const query = {};
      if (filter === 'upcoming') {
        query.status = { $in: ['scheduled', 'locked'] };
        query.startTime = { $gte: now };
      } else if (filter === 'completed') {
        query.status = 'completed';
      }
      if (phase) query.phase = phase;

      // Load all matching matches (we’ll paginate in-memory)
      const matches = await Match.find(query)
        .populate('teamA teamB')
        .sort({ startTime: 1 })
        .lean();

      if (!matches.length) {
        return interaction.editReply('No matches found with that filter.');
      }

      // Pagination helpers
      const total = matches.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      let index = 0; // index of the first match on the current page

      const pageFromIndex = (i) => Math.floor(i / PAGE_SIZE);
      const sliceForIndex = (i) => {
        const start = pageFromIndex(i) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);
        return matches.slice(start, end);
      };

      const buildEmbed = (i) => {
        const page = pageFromIndex(i);
        const pageMatches = sliceForIndex(i);
        const lines = pageMatches.map(matchLine);

        const titleFilter = filter.charAt(0).toUpperCase() + filter.slice(1);
        const titlePhase = phase ? ` — ${phase.replace('_',' ')}` : '';
        return new EmbedBuilder()
          .setTitle(`📅 Matches (${titleFilter}${titlePhase})`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: `Page ${page + 1}/${totalPages} • ${total} match(es)` });
      };

      const buildRows = (i) => {
        const page = pageFromIndex(i);

        const prevPage = new ButtonBuilder()
          .setCustomId(`m_page_prev_${interaction.id}`)
          .setLabel('« Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0);

        const prev = new ButtonBuilder()
          .setCustomId(`m_prev_${interaction.id}`)
          .setLabel('Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(i === 0);

        const next = new ButtonBuilder()
          .setCustomId(`m_next_${interaction.id}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(i >= (total - 1));

        const nextPage = new ButtonBuilder()
          .setCustomId(`m_page_next_${interaction.id}`)
          .setLabel('Page »')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1);

        // Quick-jump page selector (shows up to 25 pages due to component limits)
        const options = [];
        const startPage = 0;
        const endPage = Math.min(totalPages, 25);
        for (let p = startPage; p < endPage; p++) {
          options.push({
            label: `Page ${p + 1}`,
            value: String(p),
            default: p === page,
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`m_sel_${interaction.id}`)
          .setPlaceholder(`Jump to page (${page + 1}/${totalPages})`)
          .addOptions(options);

        return [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(prevPage, prev, next, nextPage),
        ];
      };

      const message = await interaction.editReply({
        embeds: [buildEmbed(index)],
        components: buildRows(index),
      });

      const filterFn = (i) =>
        i.user.id === interaction.user.id &&
        (
          i.customId === `m_sel_${interaction.id}` ||
          i.customId === `m_prev_${interaction.id}` ||
          i.customId === `m_next_${interaction.id}` ||
          i.customId === `m_page_prev_${interaction.id}` ||
          i.customId === `m_page_next_${interaction.id}`
        );

      const collector = message.createMessageComponentCollector({
        filter: filterFn,
        time: 5 * 60 * 1000, // 5 minutes
      });

      collector.on('collect', async (i) => {
        try {
          const page = pageFromIndex(index);

          if (i.isStringSelectMenu()) {
            const targetPage = Math.min(Math.max(parseInt(i.values[0], 10) || 0, 0), totalPages - 1);
            index = targetPage * PAGE_SIZE;
          } else if (i.isButton()) {
            if (i.customId === `m_prev_${interaction.id}` && index > 0) {
              index = index - 1;
            }
            if (i.customId === `m_next_${interaction.id}` && index < total - 1) {
              index = index + 1;
            }
            if (i.customId === `m_page_prev_${interaction.id}` && page > 0) {
              index = (page - 1) * PAGE_SIZE;
            }
            if (i.customId === `m_page_next_${interaction.id}` && page < totalPages - 1) {
              index = (page + 1) * PAGE_SIZE;
            }
          }

          await i.update({
            embeds: [buildEmbed(index)],
            components: buildRows(index),
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