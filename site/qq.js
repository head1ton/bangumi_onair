/*
 * @Description: qq spider
 * @Author: ekibun
 * @Date: 2019-08-02 13:36:17
 * @LastEditors: ekibun
 * @LastEditTime: 2019-11-17 11:10:56
 */
const utils = require('../utils')

module.exports = async (site) => {
    if (!site.week) {
        let airInfo = await utils.safeRequest(`https://v.qq.com/detail/${site.id}.html`)
        airInfo = airInfo && /每(周[一二三四五六日])(\d{2}[:：]\d{2})更/g.exec(airInfo)
        if(airInfo){
            site.week = "一二三四五六日".indexOf(airInfo[1].replace("周", "")) + 1
            site.time = airInfo[2].replace(/[:：]/, "")
        }
    }
    let json = await utils.safeRequest(`http://s.video.qq.com/get_playsource?id=${site.id.split('/')[1]}&type=4&otype=json&range=${site.sort || 1}-10000`)
    json = JSON.parse(json.substring(json.indexOf('{'), json.lastIndexOf('}') + 1))
    if (!json.PlaylistItem || !json.PlaylistItem.videoPlayList) {
        console.log(json)
        return
    }
    site.sort = (json.PlaylistItem.totalEpisode || json.PlaylistItem.videoPlayList.length || 1) - 1 + (site.sort || 1)
    return json.PlaylistItem.videoPlayList.map(ep => ({
        site: site.site,
        sort: Number(ep.episode_number),
        title: ep.title,
        url: ep.playUrl
    }))
}
if (!module.parent) {
    (async () => {
        let site = {
            site: 'qq',
            id: '8/8szu83s4qj0z4o0'
        }
        console.log(await module.exports(site))
        console.log(site)
    })()
}