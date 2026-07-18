const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../database');

module.exports = (client) => {
  const app = express();
  
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));

  const adminPasswords = process.env.ADMIN_PASSWORDS ? process.env.ADMIN_PASSWORDS.split(',') : [process.env.ADMIN_PASSWORD || 'dmgadmin123'];
  const GUILD_ID = process.env.GUILD_ID || '1423630012623491073';
  const activeSessions = new Set();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts, please try again after 15 minutes' }
  });

  app.post('/api/auth', authLimiter, (req, res) => {
    if (adminPasswords.includes(req.body.password)) {
      const token = uuidv4();
      activeSessions.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false });
    }
  });

  app.post('/api/logout', (req, res) => {
     activeSessions.delete(req.headers.authorization);
     res.json({ success: true });
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/auth') return next();
    if (activeSessions.has(req.headers.authorization)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  // --- SETTINGS & COMMANDS ---
  app.get('/api/settings', async (req, res) => {
    let doc = await prisma.settings.findUnique({ where: { guildId: GUILD_ID } });
    if (!doc) doc = await prisma.settings.create({ data: { guildId: GUILD_ID } });
    res.json(doc);
  });
  
  app.post('/api/settings', async (req, res) => {
    await prisma.settings.upsert({
      where: { guildId: GUILD_ID },
      update: req.body,
      create: { guildId: GUILD_ID, ...req.body }
    });
    
    if (req.body.memberlistChannel !== undefined) {
       const { updateMemberlistEmbed } = require('../bot/memberlistSystem');
       await updateMemberlistEmbed(client);
    }
    
    res.json({success:true});
  });

  app.get('/api/commands', async (req, res) => {
    const cmds = await prisma.command.findMany({});
    res.json(cmds);
  });
  
  app.post('/api/commands', async (req, res) => {
    try {
      await prisma.command.create({ data: req.body });
      res.json({success:true});
    } catch(err) {
      res.status(400).json({error: 'Command already exists or invalid payload'});
    }
  });
  
  app.delete('/api/commands/:name', async (req, res) => {
    await prisma.command.delete({ where: { name: req.params.name } }).catch(() => {});
    res.json({success:true});
  });

  app.get('/api/warnings', async (req, res) => {
    const warnings = await prisma.warning.findMany({});
    const formatted = {};
    for (const w of warnings) {
      if (!formatted[w.userId]) formatted[w.userId] = [];
      formatted[w.userId].push({ reason: w.reason, timestamp: w.timestamp });
    }
    res.json(formatted);
  });

  app.get('/api/tickets', async (req, res) => {
    try {
      const isArchived = req.query.archived === 'true';
      const tickets = await prisma.ticketTranscript.findMany({
        where: { isArchived },
        orderBy: { timestamp: 'desc' }
      });
      res.json(tickets);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/tickets/:id/archive', async (req, res) => {
    try {
      const { archived } = req.body;
      await prisma.ticketTranscript.update({
        where: { id: req.params.id },
        data: { isArchived: archived }
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tickets/:id', async (req, res) => {
    try {
      await prisma.ticketTranscript.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/applications', async (req, res) => {
    try {
      const applications = await prisma.application.findMany({ orderBy: { timestamp: 'desc' } });
      const formatted = applications.map(app => ({
        ...app,
        answers: JSON.parse(app.answers)
      }));
      res.json(formatted);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  app.post('/api/alerts/territory', async (req, res) => {
    try {
      const alertChannelId = '1525895370901553285';
      const roleId = '1525922040941510806';
      const channel = await client.channels.fetch(alertChannelId);
      if (channel) {
        await channel.send(`<@&${roleId}> our territory is getting attacked!`);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Channel not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send alert' });
    }
  });

  app.get('/api/users/:id', async (req, res) => {
    try {
      const user = await client.users.fetch(req.params.id);
      res.json({ tag: user.tag, avatar: user.displayAvatarURL() });
    } catch (err) {
      res.json({ tag: 'Unknown User', avatar: '' });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const guild = client.guilds.cache.first();
      const totalMembers = guild ? guild.memberCount : 0;
      
      const warnings = await prisma.warning.findMany({});
      const uniqueWarnedUsers = new Set(warnings.map(w => w.userId)).size;

      let blacklisted = 0;
      if (guild) {
        const blacklistRole = guild.roles.cache.get('1430526946969780306');
        if (blacklistRole) {
          blacklisted = blacklistRole.members.size;
        }
      }

      const memCount = totalMembers || 1; 
      
      res.json({
        totalMembers: memCount,
        notApplied: 0,
        notAppliedPct: 0,
        warnedUsers: uniqueWarnedUsers,
        warnedPct: Math.round((uniqueWarnedUsers / memCount) * 100),
        blacklisted: blacklisted,
        blacklistedPct: Math.round((blacklisted / memCount) * 100)
      });
    } catch (err) {
      res.json({ totalMembers: 0, notAppliedPct: 0, warnedPct: 0, blacklistedPct: 0 });
    }
  });

  // --- SERVER MANAGEMENT APIs ---

  app.get('/api/guild/channels', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channels = guild.channels.cache.map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }));
      res.json(channels);
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.post('/api/guild/channels', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const { name, type, parentId } = req.body;
      const channel = await guild.channels.create({ name, type, parent: parentId });
      res.json({ id: channel.id, name: channel.name });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.delete('/api/guild/channels/:id', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.id);
      await channel.delete();
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.patch('/api/guild/channels/:id', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.id);
      await channel.edit({ name: req.body.name });
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.get('/api/guild/roles', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
      res.json(roles);
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.post('/api/guild/roles', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const { name, color, permissions } = req.body;
      const role = await guild.roles.create({
        name,
        color: color || null,
        permissions: permissions || []
      });
      res.json({ id: role.id, name: role.name });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.delete('/api/guild/roles/:id', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const role = await guild.roles.fetch(req.params.id);
      await role.delete();
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.get('/api/guild/members', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const members = guild.members.cache;
      const mapped = members.map(m => ({
        id: m.id,
        tag: m.user.tag,
        avatar: m.user.displayAvatarURL(),
        roles: m.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
        joinedAt: m.joinedTimestamp
      }));
      res.json(Array.from(mapped.values()));
    } catch (err) { 
      console.error("Error fetching members:", err);
      res.status(500).json({error: err.message}); 
    }
  });

  app.post('/api/guild/members/:id/kick', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(req.params.id);
      await member.kick('Kicked via Dashboard');
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.post('/api/guild/members/:id/ban', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.members.ban(req.params.id, { reason: 'Banned via Dashboard' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.patch('/api/guild/members/:id/roles', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(req.params.id);
      await member.roles.set(req.body.roles);
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.get('/api/guild/channels/:id/messages', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.id);
      if (!channel.isTextBased()) return res.json([]);
      const messages = await channel.messages.fetch({ limit: 50 });
      const msgs = messages.map(m => ({ 
        id: m.id, 
        content: m.content, 
        author: m.author.tag, 
        avatar: m.author.displayAvatarURL(),
        bot: m.author.bot,
        timestamp: m.createdTimestamp,
        embeds: m.embeds.map(e => ({ title: e.title, description: e.description, color: e.hexColor, footer: e.footer?.text }))
      })).reverse();
      res.json(msgs);
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.post('/api/guild/channels/:id/messages', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.id);
      const { content, embed } = req.body;
      const sendPayload = { content: content || '' };
      
      if (embed && (embed.title || embed.description)) {
        const { EmbedBuilder } = require('discord.js');
        const buildEmbed = new EmbedBuilder().setColor(embed.color || '#38bdf8');
        if (embed.title) buildEmbed.setTitle(embed.title);
        if (embed.description) buildEmbed.setDescription(embed.description);
        if (embed.footer) buildEmbed.setFooter({ text: embed.footer });
        sendPayload.embeds = [buildEmbed];
      }

      const msg = await channel.send(sendPayload);
      res.json({ id: msg.id, content: msg.content, author: msg.author.tag });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.delete('/api/guild/messages/:channelId/:msgId', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.channelId);
      await channel.messages.delete(req.params.msgId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.put('/api/guild/messages/:channelId/:msgId', async (req, res) => {
    try {
      const channel = await client.channels.fetch(req.params.channelId);
      const msg = await channel.messages.fetch(req.params.msgId);
      const { content, embed } = req.body;
      const editPayload = { content: content || '' };
      
      if (embed && (embed.title || embed.description)) {
        const { EmbedBuilder } = require('discord.js');
        const buildEmbed = new EmbedBuilder().setColor(embed.color || '#38bdf8');
        if (embed.title) buildEmbed.setTitle(embed.title);
        if (embed.description) buildEmbed.setDescription(embed.description);
        if (embed.footer) buildEmbed.setFooter({ text: embed.footer });
        editPayload.embeds = [buildEmbed];
      } else {
        editPayload.embeds = [];
      }

      await msg.edit(editPayload);
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.get('/api/memberlist', async (req, res) => {
    try {
      const members = await prisma.memberlist.findMany({ orderBy: { inGameName: 'asc' } });
      res.json(members);
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.post('/api/memberlist', async (req, res) => {
    try {
      const { userId, userTag, inGameName } = req.body;
      const member = await prisma.memberlist.upsert({
        where: { userId },
        update: { inGameName, userTag },
        create: { userId, inGameName, userTag }
      });
      const { updateMemberlistEmbed } = require('../bot/memberlistSystem');
      await updateMemberlistEmbed(client);
      res.json(member);
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  app.delete('/api/memberlist/:id', async (req, res) => {
    try {
      await prisma.memberlist.delete({ where: { userId: req.params.id } });
      const { updateMemberlistEmbed } = require('../bot/memberlistSystem');
      await updateMemberlistEmbed(client);
      res.json({ success: true });
    } catch (err) { res.status(500).json({error: err.message}); }
  });

  return app;
};
