/**
 * DSclaw - Bridge Module Entry
 */

module.exports = {
    TelegramAdapter: require('./telegram-adapter'),
    FeishuAdapter: require('./feishu-adapter'),
    QQAdapter: require('./qq-adapter'),
    ChannelRouter: require('./channel-router'),
    DMRouter: require('./dm-router')
};
