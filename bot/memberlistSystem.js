const { EmbedBuilder } = require('discord.js');
const { prisma } = require('../database');

async function updateMemberlistEmbed(client) {
  try {
    const guildId = process.env.GUILD_ID || '1423630012623491073';
    const settings = await prisma.settings.findUnique({ where: { guildId } });
    if (!settings || !settings.memberlistChannel) return;

    const members = await prisma.memberlist.findMany({
      orderBy: { inGameName: 'asc' }
    });

    const channel = await client.channels.fetch(settings.memberlistChannel).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`DMG Memberlist — ${members.length} members`)
      .setColor('#38bdf8')
      .setTimestamp();

    if (members.length === 0) {
      embed.setDescription('*The memberlist is currently empty.*');
    } else {
      let description = '';
      members.forEach((m, index) => {
        description += `${index + 1}. **${m.inGameName}** — <@${m.userId}>\n`;
      });
      embed.setDescription(description);
    }

    if (settings.memberlistMessage) {
      try {
        const msg = await channel.messages.fetch(settings.memberlistMessage);
        await msg.edit({ embeds: [embed] });
        return;
      } catch (err) {
        // Message might have been deleted, send a new one
      }
    }

    // Send a new message and save its ID
    const newMsg = await channel.send({ embeds: [embed] });
    await prisma.settings.update({
      where: { guildId },
      data: { memberlistMessage: newMsg.id }
    });
  } catch (err) {
    console.error('Failed to update memberlist embed:', err);
  }
}

module.exports = { updateMemberlistEmbed };
