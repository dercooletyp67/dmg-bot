const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Settings } = require('../database');

const questions = [
  "What's your in-game name?",
  "How old are you?",
  "Why are you trying to join DMG?",
  "Which were your previous clans?",
  "What's your timezone?",
  "How often do you play?",
  "What's your META name?",
  "What have you heard about DMG?",
  "Can you talk in game?",
  "Why should we choose you instead of somebody else?",
  "Do you agree to the rules?"
];

async function getSettings() {
  const guildId = process.env.GUILD_ID || '1494354069605584896';
  const doc = await Settings.findOne({ guildId });
  return doc || {};
}

module.exports = function setupApplicationSystem(client) {
  client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
      if (interaction.customId === 'apply_start_btn') {
        const { AppCooldown } = require('../database');
        const cooldown = await AppCooldown.findOne({ userId: interaction.user.id });
        if (cooldown && cooldown.expiresAt > Date.now()) {
          return interaction.reply({ 
            content: `⏳ You are on an application cooldown! You can apply again <t:${Math.floor(cooldown.expiresAt / 1000)}:R>.`, 
            ephemeral: true 
          });
        }
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_confirm_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('apply_confirm_no').setLabel('No').setStyle(ButtonStyle.Danger)
        );
        try {
          await interaction.user.send({
            content: 'Do you actually want to apply for DMG?',
            components: [row]
          });
          await interaction.reply({ content: 'I have sent you a DM to start your application!', ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: 'I could not send you a DM. Please check your privacy settings.', ephemeral: true });
        }
      }
      
      else if (interaction.customId === 'apply_confirm_no') {
        await interaction.update({ content: 'Application cancelled.', components: [] });
      }

      else if (interaction.customId === 'apply_confirm_yes') {
        await interaction.update({ content: 'Application started! Please answer the following questions sequentially.', components: [] });
        
        let dmChannel = interaction.channel;
        if (!dmChannel || !dmChannel.send) {
           dmChannel = await interaction.user.createDM();
        }

        const user = interaction.user;
        const answers = [];
        const timestamps = [];
        const startTime = Date.now();
        let lastQuestionTime = startTime;
        
        for (let i = 0; i < questions.length; i++) {
          await dmChannel.send(`**Question ${i + 1}/${questions.length}:**\n${questions[i]}`);
          
          try {
            const collected = await dmChannel.awaitMessages({
              filter: m => m.author.id === user.id,
              max: 1,
              time: 600000, // 10 minutes per question
              errors: ['time']
            });
            const answerTime = Date.now();
            const msgContent = collected.first().content;
            
            if (msgContent.trim() === '!skipapp') {
                break;
            }
            
            timestamps.push(answerTime - lastQuestionTime);
            lastQuestionTime = answerTime;
            answers.push(msgContent);
          } catch (err) {
            await dmChannel.send('Application timed out. Please click "Apply" in the server again when you are ready.');
            return;
          }
        }
        
        const totalTimeMs = Date.now() - startTime;
        const totalMins = Math.floor(totalTimeMs / 60000);
        const totalSecs = Math.floor((totalTimeMs % 60000) / 1000);

        // Built-in heuristic AI & Plagiarism check
        const aiPhrases = [
           "as an ai", "as a language model", "delve into", "tapestry", "in conclusion", 
           "crucial", "meticulous", "testament", "realm of", "multifaceted", "moreover", 
           "furthermore", "it is important to note", "certainly!", "sure!", "here is a", 
           "here are some", "i'd be happy to", "i can help", "let me know if", "feel free to", 
           "hope this helps", "good luck", "in summary", "ah got it", "ready-to-use",
           "[", "]" // AI often leaves brackets like [insert name here]
        ];
        
        let aiScore = 0;
        let copyPasteDetected = false;
        
        for (let i = 0; i < answers.length; i++) {
           // Only scan the long-form questions: Q3 (index 2), Q8 (index 7), Q10 (index 9)
           if (i !== 2 && i !== 7 && i !== 9) continue;
           if (!answers[i]) continue;
           
           const ans = answers[i].toLowerCase();
           aiPhrases.forEach(phrase => {
              if (ans.includes(phrase)) {
                  // Give more weight to obvious AI mistakes
                  if (phrase === "[" || phrase === "]" || phrase.includes("ai") || phrase.includes("here is a")) {
                      aiScore += 40;
                  } else {
                      aiScore += 15;
                  }
              }
           });
           
           // Copy paste check:
           // Average human typing is ~5 chars/sec. Anything > 12 is likely pasted.
           const chars = ans.length;
           const secs = timestamps[i] / 1000;
           if (chars > 40 && (chars / secs) > 12) {
              copyPasteDetected = true;
           }
        }
        
        if (aiScore > 100) aiScore = 100;
        
        let reportText = `**AI Usage:** ~${aiScore}%\n`;
        if (copyPasteDetected) {
            reportText += `**Plagiarism:** ⚠️ COPY/PASTE DETECTED (Abnormal typing speed)`;
        } else {
            reportText += `**Plagiarism:** ✅ Normal typing speed`;
        }

        await dmChannel.send('Thank you! Your application has been submitted for review.');
        
        const settings = await getSettings();
        const reviewChannelId = settings.appReviewChannel || '1524881806388625408';
        
        try {
          const reviewChannel = await client.channels.fetch(reviewChannelId);
          if (reviewChannel) {
            const embed = new EmbedBuilder()
              .setTitle(`New Application from ${user.tag}`)
              .setColor('#f59e0b')
              .setThumbnail(user.displayAvatarURL())
              .setFooter({ text: `User ID: ${user.id}` })
              .setTimestamp();
              
            embed.addFields({ name: 'Time Taken', value: `${totalMins}m ${totalSecs}s` });
            embed.addFields({ name: 'AI & Plagiarism Report', value: reportText });

            for (let i = 0; i < questions.length; i++) {
              let answerValue = answers[i] || '*No answer*';
              if (answerValue.length > 1024) {
                  answerValue = answerValue.substring(0, 1020) + '...';
              }
              embed.addFields({ name: questions[i], value: answerValue });
            }

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`app_accept_${user.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`app_deny_${user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`app_blacklist_${user.id}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary)
            );

            await reviewChannel.send({ embeds: [embed], components: [row] });
            
            // Save to DB
            const { Application, AppCooldown } = require('../database');
            await Application.create({
              userId: user.id,
              userTag: user.tag,
              timeTaken: `${totalMins}m ${totalSecs}s`,
              aiScore: aiScore,
              plagiarism: copyPasteDetected,
              questions: questions,
              answers: answers,
              status: 'PENDING'
            });

            // Add to cooldown DB
            await AppCooldown.updateOne(
              { userId: user.id },
              { $set: { expiresAt: Date.now() + 24 * 60 * 60 * 1000 } },
              { upsert: true }
            );
          }
        } catch (err) {
          console.error('Failed to send application to review channel:', err);
        }
      }

      else if (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_deny_') || interaction.customId.startsWith('app_blacklist_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1]; // accept, deny, blacklist
        const targetId = parts[2];

        const modal = new ModalBuilder()
          .setCustomId(`appmodal_${action}_${targetId}`)
          .setTitle(`Reason for ${action.charAt(0).toUpperCase() + action.slice(1)}`);

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason_input')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Enter the reason here...');

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      }
    }

    else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('appmodal_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const targetId = parts[2];
        const reason = interaction.fields.getTextInputValue('reason_input');

        try {
          const targetUser = await client.users.fetch(targetId);
          if (targetUser) {
            let dmMsg = '';
            let color = '';
            if (action === 'accept') {
              dmMsg = `Congratulations! Your application to DMG has been **accepted**!\n**Reason:** ${reason}`;
              color = '#10b981';
            } else if (action === 'deny') {
              dmMsg = `We are sorry to inform you that your application to DMG has been **denied**.\n**Reason:** ${reason}`;
              color = '#ef4444';
            } else if (action === 'blacklist') {
              dmMsg = `You have been **blacklisted** from applying to DMG.\n**Reason:** ${reason}`;
              color = '#64748b';
            }

            try {
              await targetUser.send(dmMsg);
            } catch(e) { console.error('Could not DM applicant result'); }

            const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            oldEmbed.setColor(color);
            oldEmbed.addFields({ name: `Status: ${action.toUpperCase()}`, value: `**By:** <@${interaction.user.id}>\n**Reason:** ${reason}` });

            const { Application } = require('../database');
            await Application.findOneAndUpdate(
               { userId: targetId, status: 'PENDING' },
               { $set: { status: action.toUpperCase(), reason: reason, processedBy: interaction.user.tag } },
               { sort: { timestamp: -1 } }
            );

            const guild = interaction.guild;
            const logChannel = guild.channels.cache.find(c => c.name === 'application-logs');
            
            if (logChannel) {
                await logChannel.send({ embeds: [oldEmbed] });
                await interaction.message.delete().catch(()=>{});
                await interaction.reply({ content: `✅ User has been ${action}ed and the application was moved to ${logChannel}.`, ephemeral: true });
            } else {
                await interaction.update({ embeds: [oldEmbed], components: [] });
            }
          }
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: 'An error occurred while processing.', ephemeral: true });
        }
      }
    }
  });
};
