import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Player from '../models/Player.js';
import BonusPrediction from '../models/BonusPrediction.js';
import User from '../models/User.js';

function canonName(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('settle_mvp')
    .setDescription('Admin: Set actual MVP and award +5 to correct picks')
    .addStringOption(o =>
      o.setName('player')
        .setDescription('Actual MVP (player name)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }

    const actualNameRaw = interaction.options.getString('player');
    await interaction.deferReply({ flags: 64 });

    try {
      // Try resolve actual MVP to Player doc; fall back to name match
      const actualDoc = await Player.findOne({ name: new RegExp(`^${actualNameRaw}$`, 'i') }).lean();
      const actualId = actualDoc ? String(actualDoc._id) : null;
      const actualNameCanon = canonName(actualDoc ? actualDoc.name : actualNameRaw);

      const preds = await BonusPrediction.find({ type: 'mvp' }).lean();
      if (!preds.length) return interaction.editReply('No MVP bonus predictions to settle.');

      let winners = 0, totalAwarded = 0, updatedUsers = 0;

      for (const p of preds) {
        const sel = Array.isArray(p.selections) ? p.selections[0] : null; // object { name, playerId? } or string
        if (!sel) continue;

        let match = false;
        if (actualId && sel?.playerId) {
          match = String(sel.playerId) === actualId;
        }
        if (!match) {
          const selNameCanon = canonName(typeof sel === 'string' ? sel : sel.name || '');
          match = selNameCanon && selNameCanon === actualNameCanon;
        }

        const newPts = match ? 5 : 0;
        const delta = newPts - (p.points || 0);
        if (delta !== 0) {
          await BonusPrediction.updateOne({ _id: p._id }, { $set: { points: newPts } });
          const user = await User.findById(p.user);
          if (!user) continue;
          user.totalPoints = (user.totalPoints || 0) + delta;
          await user.save();
          totalAwarded += delta;
          updatedUsers += 1;
          if (match) winners += 1;
        }
      }

      return interaction.editReply(
        `✅ Settled MVP: **${actualDoc ? actualDoc.name : actualNameRaw}**.\n` +
        `• Correct picks: **${winners}**\n` +
        `• Users updated: **${updatedUsers}**\n` +
        `• Total bonus points awarded: **${totalAwarded}**`
      );
    } catch (err) {
      console.error('settle_mvp error:', err);
      return interaction.editReply('❌ Failed to settle MVP bonus.');
    }
  }
};