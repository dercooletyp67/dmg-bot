const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, MessageFlags } = require('discord.js');
const { prisma } = require('../database');

function setupBot(io) {
  const GUILD_ID = process.env.GUILD_ID || '1494354069605584896';
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages
    ],
    partials: [
      require('discord.js').Partials.Channel,
      require('discord.js').Partials.Message
    ]
  });

  client.io = io;
  
  async function sendAuditLog(embedBuilder) {
    try {
      const settings = await prisma.settings.findUnique({ where: { guildId: GUILD_ID } });
      if (settings && settings.logChannel) {
        const channel = client.channels.cache.get(settings.logChannel);
        if (channel) await channel.send({ embeds: [embedBuilder] });
      }
    } catch(e) {}
  }

  client.on('guildMemberAdd', async (member) => {
    if (member.guild.id !== GUILD_ID) return;
    try {
      const settings = await prisma.settings.findUnique({ where: { guildId: GUILD_ID } });
      if (!settings) return;
      
      if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) await member.roles.add(role);
      }

      if (settings.welcomeChannel && settings.welcomeMessage) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannel);
        if (channel) {
          const msg = settings.welcomeMessage.replace('{user}', `<@${member.id}>`).replace('{server}', member.guild.name);
          await channel.send(msg);
        }
      }
    } catch(e) {}
  });

  client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== GUILD_ID) return;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder().setColor('#f59e0b').setTitle('Member Left').setDescription(`**User:** ${member.user.tag}`).setTimestamp();
    await sendAuditLog(embed);
  });

  client.on('channelCreate', async (channel) => {
    if (channel.guild.id !== GUILD_ID) return;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder().setColor('#10b981').setTitle('Channel Created').setDescription(`**Name:** ${channel.name} (<#${channel.id}>)`).setTimestamp();
    await sendAuditLog(embed);
  });

  client.on('channelDelete', async (channel) => {
    if (channel.guild.id !== GUILD_ID) return;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder().setColor('#ef4444').setTitle('Channel Deleted').setDescription(`**Name:** ${channel.name}`).setTimestamp();
    await sendAuditLog(embed);
  });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.members.fetch();
      console.log('Successfully cached all members!');
    } catch(err) {
      console.error('Failed to cache members on startup:', err);
    }
    const commands = [
      { name: 'ping', description: 'Replies with the bot latency!' },
      { name: 'applypanel', description: 'Setup the DMG Application panel in the current channel', default_member_permissions: '8' },
      { name: 'ticketpanel', description: 'Setup the DMG Ticket panel in the current channel', default_member_permissions: '8' },
      {
        name: 'warn',
        description: 'Warns a user in the server.',
        default_member_permissions: '8',
        options: [
          { name: 'user', description: 'The user to warn', type: 6, required: true },
          { name: 'reason', description: 'The reason for the warning', type: 3, required: true },
          { name: 'dm', description: 'Should the user receive a DM?', type: 5, required: true },
        ],
      },
      {
        name: 'view-warnings',
        description: 'View all warnings for a user.',
        default_member_permissions: '8',
        options: [
          { name: 'user', description: 'The user to view warnings for', type: 6, required: true },
        ],
      },
      {
        name: 'remove-warnings',
        description: 'Remove all warnings for a user.',
        options: [
          { name: 'user', description: 'The user to clear warnings for', type: 6, required: true },
        ],
        default_member_permissions: '8'
      },
      {
        name: 'bypass-cooldown',
        description: 'Bypass a 24-hour application cooldown for a user.',
        options: [
          { name: 'user', description: 'The user to bypass the cooldown for', type: 6, required: true },
        ],
        default_member_permissions: '32'
      },
      {
        name: 'view-cooldown',
        description: 'View all users currently on an application cooldown.',
        default_member_permissions: '32'
      },
      {
        name: 'kick',
        description: 'Kicks a user from the server.',
        default_member_permissions: '8',
        options: [
          { name: 'user', description: 'The user to kick', type: 6, required: true },
          { name: 'reason', description: 'The reason for the kick', type: 3, required: false },
        ],
      },
      {
        name: 'ban',
        description: 'Bans a user from the server.',
        default_member_permissions: '8',
        options: [
          { name: 'user', description: 'The user to ban', type: 6, required: true },
          { name: 'reason', description: 'The reason for the ban', type: 3, required: false },
        ],
      },
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
      console.error(error);
    }
  });

  const setupApplicationSystem = require('./applicationSystem');
  setupApplicationSystem(client);

  const setupTicketSystem = require('./ticketSystem');
  setupTicketSystem(client);

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'applypanel') {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('DMG Application')
        .setDescription('If you want to become a member of DMG please click the button below.\n\n**How to apply**\nPress the **Apply here** button and check your DMs.')
        .setColor('#10b981')
        .setFooter({ text: 'Apps go through DM. Answers stay private.' });

      if (interaction.guild && interaction.guild.iconURL()) {
        embed.setThumbnail(interaction.guild.iconURL({ size: 256 }));
      }
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('apply_start_btn')
          .setLabel('Apply here')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ content: 'Panel created.', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row] });
    } else if (interaction.commandName === 'ticketpanel') {
      const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('📩 Contact Support')
        .setDescription('Select a category below to open a private ticket.')
        .setColor('#38bdf8');
        
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_select')
          .setPlaceholder('📍 Click here to select a category...')
          .addOptions([
            { label: 'Report a Staff', description: 'Report a staff member', value: 'report_staff', emoji: '🛑' },
            { label: 'Report a Member', description: 'Report toxic behavior or rule breaking', value: 'report', emoji: '🚫' },
            { label: 'Alliance', description: 'Request an alliance', value: 'alliance', emoji: '🤝' },
            { label: 'Something else', description: 'General questions', value: 'other', emoji: '❓' }
          ])
      );

      await interaction.reply({ content: 'Ticket panel created.', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row] });
    } else if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      await interaction.editReply(`Pong! 🏓\nBot Latency: ${latency}ms\nAPI Latency: ${Math.round(client.ws.ping)}ms`);
      
    } else if (interaction.commandName === 'kick') {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!member) {
        return interaction.reply({ content: 'That user is not in the server.', flags: MessageFlags.Ephemeral });
      }

      try {
        await member.kick(reason);
        await interaction.reply({ content: `${targetUser.tag} had been kicked. Reason: ${reason}` });
      } catch (err) {
        await interaction.reply({ content: 'I do not have permission to kick that user.', flags: MessageFlags.Ephemeral });
      }

    } else if (interaction.commandName === 'ban') {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      try {
        await interaction.guild.members.ban(targetUser.id, { reason });
        await interaction.reply({ content: `${targetUser.tag} had been banned. Reason: ${reason}` });
      } catch (err) {
        await interaction.reply({ content: 'I do not have permission to ban that user.', flags: MessageFlags.Ephemeral });
      }

    } else if (interaction.commandName === 'warn') {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const sendDm = interaction.options.getBoolean('dm');

      await prisma.warning.create({ data: { userId: targetUser.id, reason: reason } });

      await interaction.reply({ content: `Processing warning for ${targetUser}...` });

      let dmStatus = '';
      if (sendDm) {
        try {
          const warnEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('You got warned in the DMG Clan')
            .addFields({ name: 'Reason', value: reason })
            .setFooter({ text: 'If you believe this was a false warn, make a ticket.' });
            
          await targetUser.send({ embeds: [warnEmbed] });
          dmStatus = '\n*Successfully sent a DM to the user.*';
        } catch (error) {
          console.error('Failed to send DM:', error);
          dmStatus = '\n*Failed to send a DM to the user (their DMs might be closed).*';
        }
      }

      await interaction.editReply(`✅ **${targetUser.tag}** has been warned for: **${reason}**${dmStatus}`);
      
    } else if (interaction.commandName === 'view-warnings') {
      const targetUser = interaction.options.getUser('user');
      const userWarnings = await prisma.warning.findMany({ where: { userId: targetUser.id } });

      if (userWarnings.length === 0) {
        return interaction.reply({ content: `**${targetUser.tag}** has no warnings.`, flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle(`Warnings for ${targetUser.tag}`)
        .setDescription(userWarnings.map((w, i) => `${i + 1}. **Reason:** ${w.reason} (Date: <t:${Math.floor(w.timestamp / 1000)}:R>)`).join('\n'));
        
      await interaction.reply({ embeds: [embed] });
      
    } else if (interaction.commandName === 'remove-warnings') {
      const targetUser = interaction.options.getUser('user');
      const result = await prisma.warning.deleteMany({ where: { userId: targetUser.id } });
      
      if (result.count === 0) {
        return interaction.reply({ content: `**${targetUser.tag}** has no warnings to remove.`, flags: MessageFlags.Ephemeral });
      }
      
      await interaction.reply({ content: `✅ All warnings have been cleared for **${targetUser.tag}**.` });
      
    } else if (interaction.commandName === 'bypass-cooldown') {
      const targetUser = interaction.options.getUser('user');
      const result = await prisma.appCooldown.delete({ where: { userId: targetUser.id } }).catch(() => ({}));
      if (result.id) {
        await interaction.reply({ content: `✅ Removed the application cooldown for <@${targetUser.id}>. They can apply again now!`, ephemeral: true });
      } else {
        await interaction.reply({ content: `⚠️ <@${targetUser.id}> is not currently on an application cooldown.`, ephemeral: true });
      }
      
    } else if (interaction.commandName === 'view-cooldown') {
      const cooldowns = await prisma.appCooldown.findMany({});
      const activeCooldowns = cooldowns.filter(c => c.expiresAt > new Date());
      
      if (activeCooldowns.length === 0) {
        return interaction.reply({ content: `There are currently no users on an application cooldown.`, ephemeral: true });
      }
      
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor('#38bdf8')
        .setTitle('Application Cooldowns')
        .setDescription(activeCooldowns.map(c => `<@${c.userId}> - Expires <t:${Math.floor(c.expiresAt / 1000)}:R>`).join('\n'));
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
      const cmds = await prisma.command.findMany({});
      const contentLower = message.content.trim().toLowerCase();
      const cmd = cmds.find(c => {
        const trigger = c.name.toLowerCase();
        if (c.type === 'anywhere') {
          return contentLower.includes(trigger);
        } else {
          return contentLower === trigger;
        }
      });
      if (cmd) await message.reply(cmd.reply);
    } catch(e) {}

    if (client.io && message.guildId === '1494354069605584896') {
      client.io.emit('newMessage', {
        channelId: message.channelId,
        message: {
          id: message.id,
          content: message.content,
          author: message.author.tag,
          avatar: message.author.displayAvatarURL(),
          bot: message.author.bot,
          timestamp: message.createdTimestamp,
          embeds: message.embeds.map(e => ({ title: e.title, description: e.description, color: e.hexColor, footer: e.footer?.text }))
        }
      });
    }
  });

  client.on('messageDelete', async (message) => {
    if (!message.author?.bot && message.guildId === GUILD_ID) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setColor('#ef4444').setTitle('Message Deleted').setDescription(`**Author:** ${message.author?.tag || 'Unknown'}\n**Channel:** <#${message.channelId}>\n**Content:** ${message.content || 'None'}`).setTimestamp();
      await sendAuditLog(embed);
    }

    if (client.io && message.guildId === '1494354069605584896') {
      client.io.emit('deleteMessage', {
        channelId: message.channelId,
        messageId: message.id
      });
    }
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (client.io && newMsg.guildId === '1494354069605584896') {
      client.io.emit('updateMessage', {
        channelId: newMsg.channelId,
        message: {
          id: newMsg.id,
          content: newMsg.content,
          author: newMsg.author.tag,
          avatar: newMsg.author.displayAvatarURL(),
          bot: newMsg.author.bot,
          timestamp: newMsg.createdTimestamp,
          embeds: newMsg.embeds.map(e => ({ title: e.title, description: e.description, color: e.hexColor, footer: e.footer?.text }))
        }
      });
    }
  });

  return client;
}

module.exports = { setupBot };
