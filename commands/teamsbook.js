import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import Team from '../models/Team.js';

const PAGE_SIZE = 25;

export default {
  data: new SlashCommandBuilder()
    .setName('teamsbook')
    .setDescription('Browse all teams and their players')
    .addBooleanOption(opt =>
      opt.setName('ephemeral')
        .setDescription('Show only to you')
        .setRequired(false)
    ),

  async execute(interaction) {
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    // respond quickly; then edit with data
    await interaction.deferReply({ flags: ephemeral ? 64 : undefined });

    // Load teams + players (name only)
    const teams = await Team.find()
      .sort({ name: 1 })
      .populate({
        path: 'players',
        select: 'name role',
        options: { sort: { name: 1 } },
      })
      .lean();

    if (!teams.length) {
      return interaction.editReply('No teams found.');
    }

    const totalPages = Math.ceil(teams.length / PAGE_SIZE);
    let index = 0;

    const buildEmbed = (i) => {
      const t = teams[i];
      const lines = (t.players || []).map(p => `• **${p.name}**${p.role ? ` — ${p.role}` : ''}`);
      return new EmbedBuilder()
        .setTitle(`${t.name} (${t.region}) — Players`)
        .setDescription(lines.length ? lines.join('\n') : '_No players_')
        .setFooter({ text: `Team ${i + 1} of ${teams.length}` });
    };

    const buildRows = (i) => {
      const page = Math.floor(i / PAGE_SIZE);
      const start = page * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, teams.length);

      const menuOptions = teams.slice(start, end).map((t, absIdx) => {
        const globalIdx = start + absIdx;
        return {
          label: t.name,
          value: String(globalIdx),
          default: globalIdx === i,
        };
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`pb_sel_${interaction.id}`)
        .setPlaceholder(`Select a team — Page ${page + 1}/${totalPages}`)
        .addOptions(menuOptions);

      const prevPage = new ButtonBuilder()
        .setCustomId(`pb_page_prev_${interaction.id}`)
        .setLabel('« Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

      const prev = new ButtonBuilder()
        .setCustomId(`pb_prev_${interaction.id}`)
        .setLabel('Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(i === 0);

      const next = new ButtonBuilder()
        .setCustomId(`pb_next_${interaction.id}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(i === teams.length - 1);

      const nextPage = new ButtonBuilder()
        .setCustomId(`pb_page_next_${interaction.id}`)
        .setLabel('Page »')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1);

      return [
        new ActionRowBuilder().addComponents(select),
        new ActionRowBuilder().addComponents(prevPage, prev, next, nextPage),
      ];
    };

    const message = await interaction.editReply({
      embeds: [buildEmbed(index)],
      components: buildRows(index),
    });

    const filter = (i) =>
      i.user.id === interaction.user.id &&
      (
        i.customId === `pb_sel_${interaction.id}` ||
        i.customId === `pb_prev_${interaction.id}` ||
        i.customId === `pb_next_${interaction.id}` ||
        i.customId === `pb_page_prev_${interaction.id}` ||
        i.customId === `pb_page_next_${interaction.id}`
      );

    const collector = message.createMessageComponentCollector({
      filter,
      time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on('collect', async (i) => {
      try {
        if (i.isStringSelectMenu()) {
          index = Math.min(Math.max(Number(i.values[0]) || 0, 0), teams.length - 1);
        } else if (i.isButton()) {
          if (i.customId === `pb_prev_${interaction.id}` && index > 0) index--;
          if (i.customId === `pb_next_${interaction.id}` && index < teams.length - 1) index++;
          if (i.customId === `pb_page_prev_${interaction.id}`) {
            const page = Math.floor(index / PAGE_SIZE);
            if (page > 0) index = (page - 1) * PAGE_SIZE;
          }
          if (i.customId === `pb_page_next_${interaction.id}`) {
            const page = Math.floor(index / PAGE_SIZE);
            const nextStart = (page + 1) * PAGE_SIZE;
            if (nextStart < teams.length) index = nextStart;
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
  }
};