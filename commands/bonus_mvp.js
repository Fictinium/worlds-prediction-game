import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import User from '../models/User.js';
import Player from '../models/Player.js';
import Match from '../models/Match.js';
import BonusPrediction from '../models/BonusPrediction.js';
import Phase from '../models/Phase.js';

function canonName(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function computeGroupStageLockAt() {
  const firstGS = await Match.find({ phase: 'group_stage' })
    .sort({ startTime: 1 })
    .limit(1)
    .lean();
  if (!firstGS.length) return null;
  const start = new Date(firstGS[0].startTime);
  return new Date(start.getTime() - 2 * 60 * 60 * 1000);
}

export default {
  data: new SlashCommandBuilder()
    .setName('bonus_mvp')
    .setDescription('Pick MVP (by winrate/playrate). Awards +5 if correct. Locks 2h before groups.')
    .addStringOption(o =>
      o.setName('player')
        .setDescription('Player name (exact or close)')
        .setRequired(true)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    } */

    const rawName = interaction.options.getString('player');
    await interaction.deferReply({ flags: 64 });

    try {
      // Phase gate (optional): deny only when explicitly closed
      const phase = await Phase.findOne().lean();
      if (phase?.current === 'closed') {
        return interaction.editReply('❌ Bonus tips are closed right now.');
      }

      const gsLockAt = await computeGroupStageLockAt();
      if (!gsLockAt) {
        return interaction.editReply(
          '⚠️ Group Stage schedule not configured yet (no group-stage matches). ' +
          'Add a Group Stage match so I can compute the lock time.'
        );
      }

      const now = new Date();
      if (now >= gsLockAt) {
        return interaction.editReply(`🔒 MVP picks locked at **${gsLockAt.toISOString()}**.`);
      }

      // Try to resolve to a Player doc (case-insensitive exact)
      const playerDoc = await Player.findOne({ name: new RegExp(`^${rawName}$`, 'i') }).lean();
      const selection = playerDoc
        ? { name: playerDoc.name, playerId: String(playerDoc._id) }
        : { name: rawName.trim(), playerId: null };

      // Upsert user
      const user = await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        { $setOnInsert: { discordId: interaction.user.id, username: interaction.user.tag } },
        { upsert: true, new: true }
      );

      // Upsert MVP bonus prediction
      let bp = await BonusPrediction.findOne({ user: user._id, type: 'mvp' });
      if (!bp) {
        bp = await BonusPrediction.create({
          user: user._id,
          type: 'mvp',
          selections: [selection],
          lockAt: gsLockAt,
          points: 0,
        });
      } else {
        const effectiveLock = bp.lockAt ? new Date(bp.lockAt) : gsLockAt;
        if (now >= effectiveLock) {
          return interaction.editReply(`🔒 MVP picks locked at **${effectiveLock.toISOString()}**.`);
        }
        bp.selections = [selection];
        if (!bp.lockAt) bp.lockAt = gsLockAt;
        await bp.save();
      }

      return interaction.editReply(
        `✅ Saved your MVP pick: **${selection.name}**${selection.playerId ? ' (matched to roster)' : ''}.\n` +
        `🔒 Lock: **${bp.lockAt.toISOString()}** (2h before the first Group Stage match).`
      );
    } catch (err) {
      console.error('bonus_mvp error:', err);
      return interaction.editReply('❌ Failed to save your MVP pick.');
    }
  }
};