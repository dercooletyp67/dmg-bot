const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');

module.exports = function setupTicketSystem(client) {
  client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      // Defer the reply immediately so it doesn't time out during API calls
      await interaction.deferReply({ ephemeral: true });

      const categoryValue = interaction.values[0];
      const guild = interaction.guild;
      const user = interaction.user;

      // Ensure a tickets category exists
      let category = guild.channels.cache.find(c => c.name === '🎫 TICKETS' && c.type === ChannelType.GuildCategory);
      if (!category) {
        category = await guild.channels.create({
          name: '🎫 TICKETS',
          type: ChannelType.GuildCategory,
        });
      }

      // Create the private text channel
      try {
        const OWNER_ID = '937305776526065675';
        
        let permissionOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          },
          {
            id: client.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          },
          {
            id: OWNER_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          }
        ];

        const ticketChannel = await guild.channels.create({
          name: `ticket-${user.username}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: permissionOverwrites,
        });

        // Map values to nice category names
        const categoryNames = {
          'report_staff': 'Report a Staff',
          'report': 'Report a Member',
          'alliance': 'Alliance',
          'other': 'General Support'
        };

        const embed = new EmbedBuilder()
          .setTitle(`${categoryNames[categoryValue]} Ticket`)
          .setDescription(`Hello <@${user.id}>! Support will be with you shortly.\n\nPlease describe your issue or request in detail here.`)
          .setColor('#38bdf8')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
        
        await interaction.editReply({ content: `Ticket created! You can view it here: <#${ticketChannel.id}>` });
      } catch (err) {
        console.error('Failed to create ticket channel:', err);
        await interaction.editReply({ content: 'Failed to create a ticket channel. Please contact an admin.' });
      }
    }

    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Close Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_modal') {
      const reason = interaction.fields.getTextInputValue('close_reason');
      const { prisma } = require('../database');
      
      await interaction.reply({ content: 'Saving transcript and closing ticket in 3 seconds...', ephemeral: true });
      
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcriptArray = [];
        
        messages.reverse().forEach(msg => {
          transcriptArray.push({
            author: msg.member ? msg.member.displayName : msg.author.displayName || msg.author.username,
            avatar: msg.author.displayAvatarURL({ size: 64 }),
            content: msg.content,
            timestamp: msg.createdTimestamp,
            embeds: msg.embeds.map(e => ({ title: e.title, description: e.description }))
          });
        });

        await prisma.ticketTranscript.create({
          data: {
            ticketId: interaction.channel.name,
            userId: interaction.user.id,
            transcript: JSON.stringify({
              closedBy: interaction.user.tag,
              reason: reason,
              messages: transcriptArray
            })
          }
        });

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (err) {
            console.error('Failed to delete ticket channel:', err);
          }
        }, 3000);
      } catch (err) {
        console.error('Failed to save transcript:', err);
        await interaction.followUp({ content: 'Failed to save transcript. Channel will not be deleted.', ephemeral: true });
      }
    }
  });
};
