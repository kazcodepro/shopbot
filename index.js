const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const cron = require('node-cron');

// Initialize Express app for health checks
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'Bot is running!',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Bot configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Bot settings
const PREFIX = '+';

// In-memory storage (use database in production)
const ticketData = new Map();
const serverSettings = new Map();

// Bot ready event
client.once('ready', () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    client.user.setActivity(`${PREFIX}help | Helping users`, { type: 'WATCHING' });
});

// Welcome system
client.on('guildMemberAdd', async (member) => {
    const settings = serverSettings.get(member.guild.id);
    if (!settings || !settings.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(settings.welcomeChannel);
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('👋 Welcome to the server!')
        .setDescription(`Welcome ${member.user}, we're glad to have you here!`)
        .setColor('#00ff00')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: '📋 Server Rules', value: 'Please read the rules channel', inline: true },
            { name: '🎮 Have Fun', value: 'Enjoy your stay!', inline: true }
        )
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

    channel.send({ embeds: [welcomeEmbed] });
});

// Message command handler
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'help':
                await handleHelp(message);
                break;
            
            case 'ticket':
                await handleTicketCreate(message);
                break;
            
            case 'ticket-panel':
                await handleTicketPanel(message);
                break;
            
            case 'close':
            case 'close-ticket':
                await handleTicketClose(message);
                break;
            
            case 'setup-welcome':
                await handleWelcomeSetup(message, args);
                break;
            
            case 'setup-tickets':
                await handleTicketSetup(message, args);
                break;
            
            case 'userinfo':
                await handleUserInfo(message, args);
                break;
            
            case 'serverinfo':
                await handleServerInfo(message);
                break;
            
            case 'kick':
                await handleKick(message, args);
                break;
            
            case 'ban':
                await handleBan(message, args);
                break;
            
            case 'purge':
            case 'clear':
                await handlePurge(message, args);
                break;
            
            case 'ping':
                await handlePing(message);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await message.reply('❌ An error occurred while executing the command.');
    }
});

// NEW: Ticket Panel Command
async function handleTicketPanel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ You need Administrator permissions to use this command.');
    }

    const settings = serverSettings.get(message.guild.id);
    if (!settings || !settings.ticketCategory) {
        return message.reply('❌ Ticket system is not set up. Use `+setup-tickets #category @role` first.');
    }

    const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket Tool')
        .setDescription('**Partner**\n\nPour envisager un partenariat veuillez créer un ticket !\n\n🎫 **TicketTool.xyz** - Ticketing without clutter')
        .setColor('#5865F2') // Discord blurple color
        .setTimestamp();

    const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket_panel')
                .setLabel('📩 Create ticket')
                .setStyle(ButtonStyle.Primary)
        );

    await message.channel.send({
        embeds: [embed],
        components: [button]
    });

    // Delete the command message for cleaner look
    await message.delete().catch(() => {});
}

// Help command (updated to include ticket-panel)
async function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Commands')
        .setDescription(`Prefix: \`${PREFIX}\``)
        .setColor('#0099ff')
        .addFields(
            { 
                name: '🎫 Ticket System', 
                value: `\`${PREFIX}ticket\` - Create a support ticket\n\`${PREFIX}ticket-panel\` - Create ticket panel with button\n\`${PREFIX}close\` - Close current ticket\n\`${PREFIX}setup-tickets <category-id> @role\` - Setup ticket system`, 
                inline: false 
            },
            { 
                name: '👋 Welcome System', 
                value: `\`${PREFIX}setup-welcome #channel\` - Setup welcome messages`, 
                inline: false 
            },
            { 
                name: '🔧 Moderation', 
                value: `\`${PREFIX}kick @user [reason]\` - Kick a user\n\`${PREFIX}ban @user [reason]\` - Ban a user\n\`${PREFIX}purge <amount>\` - Delete messages`, 
                inline: false 
            },
            { 
                name: '📊 Utility', 
                value: `\`${PREFIX}userinfo [@user]\` - User information\n\`${PREFIX}serverinfo\` - Server information\n\`${PREFIX}ping\` - Bot latency`, 
                inline: false 
            }
        )
        .setFooter({ text: 'Use the commands without <> or []' })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Ping command
async function handlePing(message) {
    const sent = await message.reply('🏓 Pinging...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    
    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor('#0099ff')
        .addFields(
            { name: 'Latency', value: `${latency}ms`, inline: true },
            { name: 'API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
        )
        .setTimestamp();

    await sent.edit({ content: '', embeds: [embed] });
}

// Ticket system functions
async function handleTicketCreate(message) {
    const settings = serverSettings.get(message.guild.id);
    if (!settings || !settings.ticketCategory) {
        return message.reply('❌ Ticket system is not set up. Use `+setup-tickets #category @role` first.');
    }

    await createTicketForUser(message.author, message.guild, message.channel, settings);
}

// UPDATED: Create ticket function (reusable for both command and button)
async function createTicketForUser(user, guild, responseChannel, settings) {
    // Check if user already has an open ticket
    const existingTicket = Array.from(ticketData.values()).find(
        ticket => ticket.creator === user.id && guild.channels.cache.has(ticket.channelId)
    );
    
    if (existingTicket) {
        const ticketChannel = guild.channels.cache.get(existingTicket.channelId);
        return responseChannel.send(`❌ You already have an open ticket: ${ticketChannel}`);
    }

    const ticketNumber = Math.floor(Math.random() * 9000) + 1000;
    const channelName = `ticket-${ticketNumber}`;

    try {
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: settings.ticketCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                },
                {
                    id: settings.supportRole,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        ticketData.set(ticketChannel.id, {
            creator: user.id,
            createdAt: new Date(),
            ticketNumber,
            channelId: ticketChannel.id
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription('Support team will be with you shortly!')
            .setColor('#0099ff')
            .addFields(
                { name: 'Created by', value: `${user}`, inline: true },
                { name: 'Status', value: '🟢 Open', inline: true }
            )
            .setTimestamp();

        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({
            content: `${user} <@&${settings.supportRole}>`,
            embeds: [embed],
            components: [closeButton]
        });

        await responseChannel.send(`✅ Ticket created! ${ticketChannel}`);

    } catch (error) {
        console.error('Ticket creation error:', error);
        await responseChannel.send('❌ Failed to create ticket. Please try again.');
    }
}

async function handleTicketClose(message) {
    const ticket = ticketData.get(message.channel.id);
    if (!ticket) {
        return message.reply('❌ This is not a ticket channel.');
    }

    const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Closing')
        .setDescription('This ticket will be deleted in 10 seconds...')
        .setColor('#ff0000')
        .setTimestamp();

    await message.reply({ embeds: [embed] });

    setTimeout(async () => {
        try {
            ticketData.delete(message.channel.id);
            await message.channel.delete();
        } catch (error) {
            console.error('Error deleting ticket:', error);
        }
    }, 10000);
}

// UPDATED: Button interaction handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket_panel') {
        const settings = serverSettings.get(interaction.guild.id);
        if (!settings || !settings.ticketCategory) {
            return interaction.reply({
                content: '❌ Ticket system is not set up properly.',
                ephemeral: true
            });
        }

        // Check if user already has an open ticket
        const existingTicket = Array.from(ticketData.values()).find(
            ticket => ticket.creator === interaction.user.id && 
            interaction.guild.channels.cache.has(ticket.channelId)
        );
        
        if (existingTicket) {
            const ticketChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
            return interaction.reply({
                content: `❌ You already have an open ticket: ${ticketChannel}`,
                ephemeral: true
            });
        }

        // Defer the reply to give us more time
        await interaction.deferReply({ ephemeral: true });

        try {
            await createTicketForUser(interaction.user, interaction.guild, interaction, settings);
        } catch (error) {
            console.error('Ticket creation error from button:', error);
            await interaction.editReply('❌ Failed to create ticket. Please try again.');
        }
    }

    if (interaction.customId === 'close_ticket') {
        const ticket = ticketData.get(interaction.channel.id);
        if (!ticket) {
            return interaction.reply({
                content: '❌ This is not a ticket channel.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closing')
            .setDescription('This ticket will be deleted in 10 seconds...')
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        setTimeout(async () => {
            try {
                ticketData.delete(interaction.channel.id);
                await interaction.channel.delete();
            } catch (error) {
                console.error('Error deleting ticket:', error);
            }
        }, 10000);
    }
});

// Setup functions
async function handleWelcomeSetup(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ You need Administrator permissions to use this command.');
    }

    const channelMention = args[0];
    if (!channelMention) {
        return message.reply(`❌ Please mention a channel: \`${PREFIX}setup-welcome #welcome\``);
    }

    const channelId = channelMention.replace(/[<#>]/g, '');
    const channel = message.guild.channels.cache.get(channelId);
    
    if (!channel) {
        return message.reply('❌ Invalid channel. Please mention a valid channel.');
    }

    if (!serverSettings.has(message.guild.id)) {
        serverSettings.set(message.guild.id, {});
    }
    
    const settings = serverSettings.get(message.guild.id);
    settings.welcomeChannel = channel.id;
    
    await message.reply(`✅ Welcome system set up! New members will be welcomed in ${channel}`);
}

async function handleTicketSetup(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ You need Administrator permissions to use this command.');
    }

    if (args.length < 2) {
        return message.reply(`❌ Usage: \`${PREFIX}setup-tickets <category-id> @support-role\`\n\n**How to get Category ID:**\n1. Enable Developer Mode in Discord Settings\n2. Right-click the category\n3. Select "Copy ID"\n4. Use that ID in the command`);
    }

    const categoryInput = args[0];
    const roleMention = args[1];

    // Handle both ID and potential mention formats
    const categoryId = categoryInput.replace(/[<#>]/g, '');
    const roleId = roleMention.replace(/[<@&>]/g, '');

    const category = message.guild.channels.cache.get(categoryId);
    const role = message.guild.roles.cache.get(roleId);

    if (!category) {
        return message.reply('❌ Invalid category. Please mention a valid category.');
    }

    // Check if it's actually a category channel
    if (category.type !== ChannelType.GuildCategory) {
        return message.reply(`❌ ${category} is not a category. Please mention a category (folder), not a regular channel.\n\n**How to create a category:**\n1. Right-click in your server's channel list\n2. Select "Create Category"\n3. Name it (e.g., "Support Tickets")\n4. Then use that category in this command`);
    }

    if (!role) {
        return message.reply('❌ Invalid role. Please mention a valid role.');
    }

    if (!serverSettings.has(message.guild.id)) {
        serverSettings.set(message.guild.id, {});
    }
    
    const settings = serverSettings.get(message.guild.id);
    settings.ticketCategory = category.id;
    settings.supportRole = role.id;
    
    await message.reply(`✅ Ticket system set up!\nCategory: ${category}\nSupport Role: ${role}`);
}

// Utility commands
async function handleUserInfo(message, args) {
    let user;
    
    if (args[0]) {
        const userId = args[0].replace(/[<@!>]/g, '');
        user = await client.users.fetch(userId).catch(() => null);
    } else {
        user = message.author;
    }

    if (!user) {
        return message.reply('❌ User not found.');
    }

    const member = message.guild.members.cache.get(user.id);

    const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setColor('#0099ff')
        .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function handleServerInfo(message) {
    const guild = message.guild;
    
    const embed = new EmbedBuilder()
        .setTitle(`🏰 ${guild.name}`)
        .setThumbnail(guild.iconURL())
        .setColor('#0099ff')
        .addFields(
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Moderation commands
async function handleKick(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.reply('❌ You need Kick Members permission to use this command.');
    }

    if (!args[0]) {
        return message.reply(`❌ Usage: \`${PREFIX}kick @user [reason]\``);
    }

    const userId = args[0].replace(/[<@!>]/g, '');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const member = message.guild.members.cache.get(userId);

    if (!member) {
        return message.reply('❌ User not found in this server.');
    }

    if (!member.kickable) {
        return message.reply('❌ Cannot kick this user.');
    }

    try {
        await member.kick(reason);
        await message.reply(`✅ Kicked ${member.user.tag} for: ${reason}`);
    } catch (error) {
        await message.reply('❌ Failed to kick user.');
    }
}

async function handleBan(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply('❌ You need Ban Members permission to use this command.');
    }

    if (!args[0]) {
        return message.reply(`❌ Usage: \`${PREFIX}ban @user [reason]\``);
    }

    const userId = args[0].replace(/[<@!>]/g, '');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const member = message.guild.members.cache.get(userId);

    if (member && !member.bannable) {
        return message.reply('❌ Cannot ban this user.');
    }

    try {
        await message.guild.bans.create(userId, { reason });
        const user = await client.users.fetch(userId);
        await message.reply(`✅ Banned ${user.tag} for: ${reason}`);
    } catch (error) {
        await message.reply('❌ Failed to ban user.');
    }
}

async function handlePurge(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('❌ You need Manage Messages permission to use this command.');
    }

    const amount = parseInt(args[0]);
    
    if (!amount || amount < 1 || amount > 100) {
        return message.reply(`❌ Usage: \`${PREFIX}purge <1-100>\``);
    }

    try {
        const messages = await message.channel.bulkDelete(amount + 1, true);
        const reply = await message.channel.send(`✅ Deleted ${messages.size - 1} messages.`);
        
        // Delete confirmation message after 5 seconds
        setTimeout(() => {
            reply.delete().catch(() => {});
        }, 5000);
        
    } catch (error) {
        await message.reply('❌ Failed to delete messages.');
    }
}

// Keep-alive ping (cron job alternative)
cron.schedule('*/5 * * * *', () => {
    console.log('Bot heartbeat - ' + new Date().toISOString());
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Login
client.login(process.env.DISCORD_TOKEN);
