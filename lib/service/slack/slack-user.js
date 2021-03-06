const User = require('../../model/user')

const { parseEmoji } = require('./message-parser')

function normalizeStatusEmoji(statusEmoji) {
  return statusEmoji.substr(1, statusEmoji.length - 2)
}

class SlackUser extends User {
  constructor(account, event) {
    // Slack has multiple fields for names.
    // title: event.profile.title
    //status text: event.profile.status_text
    /*if(event.name === 'ckotha'){
      console.log(event)
    }*/
    let name = event.name
    let realName = ''
    let email = ''
    let phoneNumber = ''
    let statusText = ''
    let title = ''

    if (!event.bot_id && event.real_name)
      realName = event.real_name

    if (!event.bot_id && event.profile.email)
      email = event.profile.email

    if (!event.bot_id && event.profile.phone)
      phoneNumber = event.profile.phone

    if (!event.bot_id && event.profile.title)
      title = event.profile.title

    if (!event.bot_id && event.profile.status_text)
      statusText = event.profile.status_text

    if (event.profile && event.profile.display_name)
      name = event.profile.display_name
    else if (event.username)
      name = event.username

    // And multiple fields for icons.
    let icon = ''
    if (event.icons) {
      if (event.icons.image_72)
        icon = event.icons.image_72
      else if (event.icons.emoji)
        icon = account.emoji[normalizeStatusEmoji(event.icons.emoji)]
    } else if (event.profile && event.profile.image_72) {
      icon = event.profile.image_72
    }

    // Bot users are different from normal users.
    if (event.bot_id) {
      super(event.bot_id, name, icon)
      this.isBot = true
    } else {
      super(event.id, name, icon, realName, email, phoneNumber, statusText, title)
      this.isBot = event.is_bot
      if (event.profile && event.profile.status_emoji)
        this.statusEmoji = parseEmoji(account, 16, normalizeStatusEmoji(event.profile.status_emoji))
    }
  }

  setAway(isAway) {
    this.isAway = isAway
  }
}

module.exports = SlackUser
