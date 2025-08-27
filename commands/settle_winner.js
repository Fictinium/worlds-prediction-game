import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import BonusPrediction from '../models/BonusPrediction.js';
import User from '../models/User.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settle_winner')
    .setDescription('Admin: Set the actual Worlds winner and award bonus points (+4)')
    .addStringOption(o => o.setName('team').setDescription('Actual winner team name').setRequired(true))
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */
    const teamName = interaction.options.getString('team').trim();
    await interaction.deferReply({ flags: 64 });

    try {
      const winner = await Team.findOne({ name: new RegExp(`^${teamName}$`, 'i') });
      if (!winner) return interaction.editReply(`❌ Team "${teamName}" not found.`);

      const preds = await BonusPrediction.find({ type: 'worlds_winner' }).lean();
      if (preds.length === 0) return interaction.editReply('No winner bonus predictions to settle.');

      let totalAwarded = 0, winners = 0;
      for (const p of preds) {
        const correct = String(p.selections?.[0]) === String(winner._id);
        const newPts = correct ? 4 : 0;
        const delta = newPts - (p.points || 0);
        if (delta !== 0) {
          await BonusPrediction.updateOne({ _id: p._id }, { $set: { points: newPts } });
          const user = await User.findById(p.user);
          if (!user) continue;
          user.totalPoints = (user.totalPoints || 0) + delta;
          await user.save();
          totalAwarded += delta;
          if (correct) winners++;
        }
      }

      return interaction.editReply(
        `✅ Settled Worlds winner: **${winner.name}**.\n` +
        `• Correct picks: **${winners}**\n` +
        `• Total bonus points awarded: **${totalAwarded}**`
      );
    } catch (err) {
      console.error('settle_winner error:', err);
      return interaction.editReply('❌ Failed to settle winner bonus.');
    }
  }
};