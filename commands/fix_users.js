import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import mongoose from 'mongoose';
import User from '../models/User.js';

function looksLikeObjectId(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);
}

export default {
  data: new SlashCommandBuilder()
    .setName('fix_users')
    .setDescription('Admin: Merge ghost users created by old results bug into their real users')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });

    try {
      const all = await User.find().lean();
      const byId = new Map(all.map(u => [String(u._id), u]));
      const ghosts = all.filter(u => looksLikeObjectId(u.discordId) && byId.has(u.discordId));

      let merged = 0;
      let transferredPoints = 0;

      for (const ghost of ghosts) {
        const target = byId.get(ghost.discordId); // real user whose _id == ghost.discordId
        if (!target) continue;

        // Move totals
        const gTotal = ghost.totalPoints || 0;
        const gPhase = ghost.phasePoints || {};
        const tPhase = target.phasePoints || {};

        const newPhase = {
          group_stage: (tPhase.group_stage || 0) + (gPhase.group_stage || 0),
          top_4:       (tPhase.top_4       || 0) + (gPhase.top_4       || 0),
          finals:      (tPhase.finals      || 0) + (gPhase.finals      || 0),
        };

        await User.updateOne(
          { _id: target._id },
          {
            $set: { phasePoints: newPhase },
            $inc: { totalPoints: gTotal },
          }
        );

        // delete ghost
        await User.deleteOne({ _id: ghost._id });

        merged += 1;
        transferredPoints += gTotal;
      }

      return interaction.editReply(
        `✅ Fixed users. Merged **${merged}** ghost user(s); transferred **${transferredPoints}** point(s).`
      );
    } catch (err) {
      console.error('fix_users error:', err);
      return interaction.editReply('❌ Failed to fix users.');
    }
  }
};