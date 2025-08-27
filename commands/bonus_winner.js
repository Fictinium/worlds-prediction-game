import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import BonusPrediction from '../models/BonusPrediction.js';
import Phase from '../models/Phase.js';

// Compute the real lock moment: 2h before the FIRST group stage match start
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
    .setName('bonus_winner')
    .setDescription('Pick who will win Worlds (awards 4 points if correct). Locks 2h before groups.')
    .addStringOption(o =>
      o.setName('team')
        .setDescription('Exact team name')
        .setRequired(true)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    } */

    const teamName = interaction.options.getString('team').trim();
    await interaction.deferReply({ flags: 64 });

    try {
      // Optional phase gate: allow only before or during "group_stage" but before the lock moment
      const phase = await Phase.findOne().lean();
      if (phase?.current === 'closed') {
        return interaction.editReply('❌ Bonus tips are closed right now.');
      }

      // Find team
      const team = await Team.findOne({ name: new RegExp(`^${teamName}$`, 'i') });
      if (!team) {
        return interaction.editReply(`❌ Team "${teamName}" not found. Make sure the name matches exactly.`);
      }

      // Compute the canonical lock time (2h before first group-stage game)
      const gsLockAt = await computeGroupStageLockAt();
      if (!gsLockAt) {
        return interaction.editReply(
          '⚠️ Group Stage schedule is not configured yet (no group-stage matches found). ' +
          'Add at least one Group Stage match so I can calculate the lock time.'
        );
      }

      const now = new Date();
      const isLocked = now >= gsLockAt;

      // Upsert user
      const user = await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
          $setOnInsert: {
            discordId: interaction.user.id,
            username: interaction.user.tag,
          }
        },
        { upsert: true, new: true }
      );

      // Fetch or create the user's bonus prediction doc
      let bp = await BonusPrediction.findOne({ user: user._id, type: 'worlds_winner' });

      // If already created, respect its stored lockAt; otherwise store the canonical one
      if (!bp) {
        bp = await BonusPrediction.create({
          user: user._id,
          type: 'worlds_winner',
          selections: [team._id],
          lockAt: gsLockAt,
          points: 0,
        });

        return interaction.editReply(
          `✅ Saved your Worlds winner pick: **${team.name}**.\n` +
          `🔒 Picks lock at **${bp.lockAt.toISOString()}** (2h before the first Group Stage match).`
        );
      }

      // If we have a doc, use whichever lockAt is earlier to be safe & consistent
      const effectiveLock = bp.lockAt ? new Date(bp.lockAt) : gsLockAt;
      const locked = now >= effectiveLock;

      if (locked) {
        return interaction.editReply(
          `🔒 Picks are locked since **${effectiveLock.toISOString()}**. ` +
          `Your stored pick is **${bp.selections?.length ? 'set' : 'not set'}**.`
        );
      }

      // Update the selection (still before lock)
      bp.selections = [team._id];
      // If lockAt was missing (older doc), set it now based on canonical GS lock
      if (!bp.lockAt) bp.lockAt = gsLockAt;
      await bp.save();

      return interaction.editReply(
        `✅ Updated your Worlds winner pick to **${team.name}**.\n` +
        `🔒 Picks lock at **${bp.lockAt.toISOString()}** (2h before the first Group Stage match).`
      );
    } catch (err) {
      console.error('bonus_winner error:', err);
      return interaction.editReply('❌ Failed to save your winner pick.');
    }
  }
};