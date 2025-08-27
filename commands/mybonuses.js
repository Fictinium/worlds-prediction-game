import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import User from '../models/User.js';
import BonusPrediction from '../models/BonusPrediction.js';
import Team from '../models/Team.js';
import Player from '../models/Player.js';

function fmtLock(bp) {
  if (!bp?.lockAt) return '—';
  const locked = new Date() >= new Date(bp.lockAt);
  return `${locked ? '🔒 Locked' : '🕒 Unlocks'} at ${new Date(bp.lockAt).toISOString()}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('mybonuses')
    .setDescription('View your bonus picks (winner, advancers, MVP)')
    .addBooleanOption(o =>
      o.setName('ephemeral')
        .setDescription('Show only to you (default: true)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const ephemeral = interaction.options.getBoolean('ephemeral');
    const flags = (ephemeral === false) ? undefined : 64; // default to private

    await interaction.deferReply({ flags });

    try {
      const user = await User.findOne({ discordId: interaction.user.id });
      if (!user) {
        return interaction.editReply('You have no bonus picks yet.');
      }

      const bps = await BonusPrediction.find({ user: user._id }).lean();
      if (!bps.length) {
        return interaction.editReply('You have no bonus picks yet.');
      }

      // map by type for easy access
      const byType = Object.fromEntries(bps.map(b => [b.type, b]));

      // Winner (teamId)
      let winnerText = '_None_';
      let winnerLock = '—';
      if (byType.worlds_winner) {
        const teamId = byType.worlds_winner.selections?.[0];
        let teamName = '_Unknown team_';
        if (teamId) {
          const t = await Team.findById(teamId).lean();
          if (t) teamName = t.name;
        }
        winnerText = `**${teamName}**`;
        winnerLock = fmtLock(byType.worlds_winner);
        if (typeof byType.worlds_winner.points === 'number') {
          winnerText += ` — ${byType.worlds_winner.points} pts`;
        }
      }

      // Advancers ([teamId])
      let advancersText = '_None_';
      let advancersLock = '—';
      if (byType.groups_advancers) {
        const ids = (byType.groups_advancers.selections || []).map(String);
        if (ids.length) {
          const teams = await Team.find({ _id: { $in: ids } }).lean();
          const nameById = new Map(teams.map(t => [String(t._id), t.name]));
          const names = ids.map(id => nameById.get(id) || `Unknown(${id.slice(-5)})`);
          advancersText = names.map(n => `• ${n}`).join('\n');
        }
        advancersLock = fmtLock(byType.groups_advancers);
        if (typeof byType.groups_advancers.points === 'number') {
          advancersText += `\n— ${byType.groups_advancers.points} pts`;
        }
      }

      // MVP (object { name, playerId? })
      let mvpText = '_None_';
      let mvpLock = '—';
      if (byType.mvp) {
        const sel = Array.isArray(byType.mvp.selections) ? byType.mvp.selections[0] : null;
        if (sel) {
          if (sel.playerId) {
            const p = await Player.findById(sel.playerId).lean();
            mvpText = `**${p?.name || sel.name || 'Unknown'}**`;
          } else {
            mvpText = `**${sel.name || 'Unknown'}**`;
          }
        }
        mvpLock = fmtLock(byType.mvp);
        if (typeof byType.mvp.points === 'number') {
          mvpText += ` — ${byType.mvp.points} pts`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎯 Bonus picks — ${interaction.user.username}`)
        .addFields(
          { name: '🏆 Worlds Winner (+4 if correct)', value: `${winnerText}\n${winnerLock}` },
          { name: '🚀 Advancers (+3 each)', value: `${advancersText}\n${advancersLock}` },
          { name: '⭐ MVP (+5)', value: `${mvpText}\n${mvpLock}` },
        );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('mybonuses error:', err);
      return interaction.editReply('❌ Failed to fetch your bonus picks.');
    }
  }
};