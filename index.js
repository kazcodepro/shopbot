const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
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

// In-memory storage (use database in production)
const ticketData = new Map();
const serverSettings = new Map();

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a support ticket'),
    
    new SlashCommandBuilder()
        .setName('close-ticket')
        .setDescription('Close the current ticket'),
    
    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('Setup welcome system')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Welcome channel')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Setup ticket system')
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('Ticket category')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('support-role')
                .setDescription('Support team role')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get user information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to get info about')),
    
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Get server information'),
    
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for kick')),
    
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for ban')),
    
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
];

// Register slash commands
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    client.user.setActivity('Helping users | /ticket', { type: 'WATCHING' });
    await registerCommands();
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

// Slash command handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild, member, channel } = interaction;

    try {
        switch (commandName) {
            case 'ticket':
                await handleTicketCreate(interaction);
                break;
            
            case 'close-ticket':
                await handleTicketClose(interaction);
                break;
            
            case 'setup-welcome':
                await handleWelcomeSetup(interaction);
                break;
            
            case 'setup-tickets':
                await handleTicketSetup(interaction);
                break;
            
            case 'userinfo':
                await handleUserInfo(interaction);
                break;
            
            case 'serverinfo':
                await handleServerInfo(interaction);
                break;
            
            case 'kick':
                await handleKick(interaction);
                break;
            
            case 'ban':
                await handleBan(interaction);
                break;
            
            case 'purge':
                await handlePurge(interaction);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await interaction.reply({
            content: 'An error occurred while executing the command.',
            ephemeral: true
        });
    }
});

// Ticket system functions
async function handleTicketCreate(interaction) {
    const settings = serverSettings.get(interaction.guild.id);
    if (!settings || !settings.ticketCategory) {
        return interaction.reply({
            content: 'Ticket system is not set up. Use `/setup-tickets` first.',
            ephemeral: true
        });
    }

    const ticketNumber = Math.floor(Math.random() * 9000) + 1000;
    const channelName = `ticket-${ticketNumber}`;

    try {
        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: settings.ticketCategory,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                },
                {
                    id: settings.supportRole,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        ticketData.set(ticketChannel.id, {
            creator: interaction.user.id,
            createdAt: new Date(),
            ticketNumber
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription('Support team will be with you shortly!')
            .setColor('#0099ff')
            .addFields(
                { name: 'Created by', value: `${interaction.user}`, inline: true },
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
            content: `${interaction.user} <@&${settings.supportRole}>`,
            embeds: [embed],
            components: [closeButton]
        });

        await interaction.reply({
            content: `Ticket created! ${ticketChannel}`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Ticket creation error:', error);
        await interaction.reply({
            content: 'Failed to create ticket. Please try again.',
            ephemeral: true
        });
    }
}

async function handleTicketClose(interaction) {
    const ticket = ticketData.get(interaction.channel.id);
    if (!ticket) {
        return interaction.reply({
            content: 'This is not a ticket channel.',
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

// Button interaction handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'close_ticket') {
        await handleTicketClose(interaction);
    }
});

// Setup functions
async function handleWelcomeSetup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: 'You need Administrator permissions to use this command.',
            ephemeral: true
        });
    }

    const channel = interaction.options.getChannel('channel');
    
    if (!serverSettings.has(interaction.guild.id)) {
        serverSettings.set(interaction.guild.id, {});
    }
    
    const settings = serverSettings.get(interaction.guild.id);
    settings.welcomeChannel = channel.id;
    
    await interaction.reply({
        content: `✅ Welcome system set up! New members will be welcomed in ${channel}`,
        ephemeral: true
    });
}

async function handleTicketSetup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: 'You need Administrator permissions to use this command.',
            ephemeral: true
        });
    }

    const category = interaction.options.getChannel('category');
    const supportRole = interaction.options.getRole('support-role');
    
    if (!serverSettings.has(interaction.guild.id)) {
        serverSettings.set(interaction.guild.id, {});
    }
    
    const settings = serverSettings.get(interaction.guild.id);
    settings.ticketCategory = category.id;
    settings.supportRole = supportRole.id;
    
    await interaction.reply({
        content: `✅ Ticket system set up!\nCategory: ${category}\nSupport Role: ${supportRole}`,
        ephemeral: true
    });
}

// Utility commands
async function handleUserInfo(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

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

    await interaction.reply({ embeds: [embed] });
}

async function handleServerInfo(interaction) {
    const guild = interaction.guild;
    
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

    await interaction.reply({ embeds: [embed] });
}

// Moderation commands
async function handleKick(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({
            content: 'You need Kick Members permission to use this command.',
            ephemeral: true
        });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
        return interaction.reply({
            content: 'User not found in this server.',
            ephemeral: true
        });
    }

    if (!member.kickable) {
        return interaction.reply({
            content: 'Cannot kick this user.',
            ephemeral: true
        });
    }

    try {
        await member.kick(reason);
        await interaction.reply({
            content: `✅ Kicked ${user.tag} for: ${reason}`,
            ephemeral: true
        });
    } catch (error) {
        await interaction.reply({
            content: 'Failed to kick user.',
            ephemeral: true
        });
    }
}

async function handleBan(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({
            content: 'You need Ban Members permission to use this command.',
            ephemeral: true
        });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(user.id);

    if (member && !member.bannable) {
        return interaction.reply({
            content: 'Cannot ban this user.',
            ephemeral: true
        });
    }

    try {
        await interaction.guild.bans.create(user.id, { reason });
        await interaction.reply({
            content: `✅ Banned ${user.tag} for: ${reason}`,
            ephemeral: true
        });
    } catch (error) {
        await interaction.reply({
            content: 'Failed to ban user.',
            ephemeral: true
        });
    }
}

async function handlePurge(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            content: 'You need Manage Messages permission to use this command.',
            ephemeral: true
        });
    }

    const amount = interaction.options.getInteger('amount');

    try {
        const messages = await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({
            content: `✅ Deleted ${messages.size} messages.`,
            ephemeral: true
        });
    } catch (error) {
        await interaction.reply({
            content: 'Failed to delete messages.',
            ephemeral: true
        });
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