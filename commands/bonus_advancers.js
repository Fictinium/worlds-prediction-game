import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import BonusPrediction from '../models/BonusPrediction.js';
import Phase from '../models/Phase.js';

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
    .setName('bonus_advancers')
    .setDescription('Pick the teams that will advance out of groups (awards +3 per correct team). Locks 2h before groups.')
    .addStringOption(o =>
      o.setName('teams')
        .setDescription('Comma-separated team names (e.g., "T1, G2, GEN, TES")')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('max')
        .setDescription('Max number of teams you are allowed to submit (default 8)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(32)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    } */

    const raw = interaction.options.getString('teams');
    const max = interaction.options.getInteger('max') ?? 8;

    await interaction.deferReply({ flags: 64 });

    try {
      // Optional phase check (keep open unless explicitly closed)
      const phase = await Phase.findOne().lean();
      if (phase?.current === 'closed') {
        return interaction.editReply('❌ Bonus tips are closed right now.');
      }

      const gsLockAt = await computeGroupStageLockAt();
      if (!gsLockAt) {
        return interaction.editReply(
          '⚠️ Group Stage schedule not configured yet (no group-stage matches found). ' +
          'Add a Group Stage match so I can compute the lock time.'
        );
      }

      const now = new Date();
      if (now >= gsLockAt) {
        return interaction.editReply(`🔒 Picks locked at **${gsLockAt.toISOString()}**.`);
      }

      // Parse comma-separated names
      const names = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (!names.length) return interaction.editReply('❌ Provide at least one team name.');

      if (names.length > max) {
        return interaction.editReply(`❌ You provided ${names.length} teams but the max is ${max}.`);
      }

      // Resolve teams (case-insensitive exact match)
      const teams = await Team.find({
        $or: names.map(n => ({ name: new RegExp(`^${n}$`, 'i') })),
      }).lean();

      // Report any that didn’t resolve
      const foundNames = new Set(teams.map(t => t.name.toLowerCase()));
      const missing = names.filter(n => !teams.find(t => t.name.toLowerCase() === n.toLowerCase()));
      if (missing.length) {
        return interaction.editReply(`❌ These team(s) were not found: ${missing.map(m => `\`${m}\``).join(', ')}`);
      }

      // Upsert user
      const user = await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        { $setOnInsert: { discordId: interaction.user.id, username: interaction.user.tag } },
        { upsert: true, new: true }
      );

      // Upsert BonusPrediction (type: groups_advancers)
      const teamIds = teams.map(t => t._id);
      let bp = await BonusPrediction.findOne({ user: user._id, type: 'groups_advancers' });

      if (!bp) {
        bp = await BonusPrediction.create({
          user: user._id,
          type: 'groups_advancers',
          selections: teamIds,
          lockAt: gsLockAt,
          points: 0,
        });
      } else {
        const effectiveLock = bp.lockAt ? new Date(bp.lockAt) : gsLockAt;
        if (now >= effectiveLock) {
          return interaction.editReply(`🔒 Picks locked at **${effectiveLock.toISOString()}**.`);
        }
        bp.selections = teamIds;
        if (!bp.lockAt) bp.lockAt = gsLockAt;
        await bp.save();
      }

      return interaction.editReply(
        `✅ Saved your advancers (${teamIds.length}/${max}): **${teams.map(t => t.name).join(', ')}**\n` +
        `🔒 Lock: **${bp.lockAt.toISOString()}** (2h before the first Group Stage match).`
      );
    } catch (err) {
      console.error('bonus_advancers error:', err);
      return interaction.editReply('❌ Failed to save your advancers.');
    }
  }
};