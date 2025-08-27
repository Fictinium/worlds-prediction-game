import { SlashCommandBuilder /*, PermissionFlagsBits */ } from 'discord.js';
import Phase from '../models/Phase.js';

export default {
  data: new SlashCommandBuilder()
    .setName('updatephase')
    .setDescription('Admin: Set the current tournament phase (controls tipping windows)')
    .addStringOption(o =>
      o.setName('phase')
        .setDescription('Phase to set')
        .addChoices(
          { name: 'Group Stage', value: 'group_stage' },
          { name: 'Top 4',       value: 'top_4' },
          { name: 'Finals',      value: 'finals' },
          { name: 'Closed',      value: 'closed' },
        )
        .setRequired(true)
    )
    /* .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) */,

  async execute(interaction) {
    /* if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can use this command.', flags: 64 });
    } */

    const phase = interaction.options.getString('phase');

    await interaction.deferReply({ flags: 64 });

    try {
      const doc = await Phase.findOneAndUpdate(
        {},
        { current: phase },
        { upsert: true, new: true }
      );
      return interaction.editReply(`✅ Phase set to **${doc.current.replace('_', ' ')}**.`);
    } catch (err) {
      console.error('Error updating phase:', err);
      return interaction.editReply('❌ Failed to update phase.');
    }
  }
};