import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import BonusPrediction from '../models/BonusPrediction.js';
import User from '../models/User.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settle_advancers')
    .setDescription('Admin: Set actual list of teams that advanced from groups; awards +3 per correct team')
    .addStringOption(o =>
      o.setName('teams')
        .setDescription('Comma-separated team names (e.g., "T1, G2, GEN, TES")')
        .setRequired(true)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */

    const raw = interaction.options.getString('teams');

    await interaction.deferReply({ flags: 64 });

    try {
      const names = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (!names.length) return interaction.editReply('❌ Provide at least one team name.');

      const teams = await Team.find({
        $or: names.map(n => ({ name: new RegExp(`^${n}$`, 'i') })),
      }).lean();

      const missing = names.filter(n => !teams.find(t => t.name.toLowerCase() === n.toLowerCase()));
      if (missing.length) {
        return interaction.editReply(`❌ These team(s) were not found: ${missing.map(m => `\`${m}\``).join(', ')}`);
      }

      const actualIds = teams.map(t => String(t._id));
      const preds = await BonusPrediction.find({ type: 'groups_advancers' }).lean();

      if (preds.length === 0) {
        return interaction.editReply('No advancers bonus predictions to settle.');
      }

      let totalAwarded = 0;
      let updatedUsers = 0;

      for (const p of preds) {
        const selIds = (p.selections || []).map(String);
        const correctCount = selIds.filter(id => actualIds.includes(id)).length;
        const newPts = correctCount * 3;

        const delta = newPts - (p.points || 0);
        if (delta !== 0) {
          await BonusPrediction.updateOne({ _id: p._id }, { $set: { points: newPts } });

          const user = await User.findById(p.user);
          if (!user) continue;

          user.totalPoints = (user.totalPoints || 0) + delta;
          await user.save();

          totalAwarded += delta;
          updatedUsers += 1;
        }
      }

      return interaction.editReply(
        `✅ Settled group advancers.\n` +
        `• Actual: **${teams.map(t => t.name).join(', ')}**\n` +
        `• Users updated: **${updatedUsers}**\n` +
        `• Total bonus points awarded: **${totalAwarded}**`
      );
    } catch (err) {
      console.error('settle_advancers error:', err);
      return interaction.editReply('❌ Failed to settle advancers.');
    }
  }
};