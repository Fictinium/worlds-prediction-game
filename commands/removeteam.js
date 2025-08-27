import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Team from '../models/Team.js';
import Player from '../models/Player.js';
import Match from '../models/Match.js';
import Prediction from '../models/Prediction.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removeteam')
    .setDescription('Admin: Remove a team and its players. Optionally remove matches & predictions too.')
    .addStringOption(o =>
      o.setName('name')
        .setDescription('Exact team name')
        .setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName('force')
        .setDescription('Also delete matches & predictions involving this team')
        .setRequired(false)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */

    const name = interaction.options.getString('name').trim();
    const force = interaction.options.getBoolean('force') ?? false;

    await interaction.deferReply({ flags: 64 });

    try {
      const team = await Team.findOne({ name: new RegExp(`^${name}$`, 'i') });
      if (!team) return interaction.editReply(`❌ Team "${name}" not found.`);

      const [playerCount, matchCount] = await Promise.all([
        Player.countDocuments({ team: team._id }),
        Match.countDocuments({ $or: [{ teamA: team._id }, { teamB: team._id }] }),
      ]);

      if (matchCount > 0 && !force) {
        return interaction.editReply(
          `⚠️ Team "${team.name}" participates in **${matchCount}** match(es). ` +
          `Re-run with \`force:true\` to also delete those matches and their predictions.\n` +
          `This will also delete **${playerCount}** player(s).`
        );
      }

      // If force, delete matches and predictions referencing those matches
      let deletedPreds = 0;
      let deletedMatches = 0;

      if (force && matchCount > 0) {
        const matches = await Match.find({ $or: [{ teamA: team._id }, { teamB: team._id }] }, { _id: 1 });
        const matchIds = matches.map(m => m._id);

        const [predRes, matchRes] = await Promise.all([
          Prediction.deleteMany({ match: { $in: matchIds } }),
          Match.deleteMany({ _id: { $in: matchIds } }),
        ]);
        deletedPreds = predRes.deletedCount || 0;
        deletedMatches = matchRes.deletedCount || 0;
      }

      // Delete players then the team
      const [playersRes] = await Promise.all([
        Player.deleteMany({ team: team._id }),
      ]);

      await Team.deleteOne({ _id: team._id });

      return interaction.editReply(
        `🗑️ Deleted team **${team.name}**.\n` +
        `• Players removed: **${playersRes.deletedCount || 0}**\n` +
        (force
          ? `• Matches removed: **${deletedMatches}**\n• Predictions removed: **${deletedPreds}**`
          : `• Matches not removed (run with \`force:true\` to remove them too).`)
      );

    } catch (err) {
      console.error('Error removing team:', err);
      return interaction.editReply('❌ Failed to remove team.');
    }
  }
};