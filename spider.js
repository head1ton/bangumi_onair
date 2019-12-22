/*
 * @Description: 
 * @Author: ekibun
 * @Date: 2019-07-14 18:35:31
 * @LastEditors  : ekibun
 * @LastEditTime : 2019-12-22 22:13:36
 */
const bangumiData = require('bangumi-data')
const fs = require('fs')
const path = require('path')
const utils = require('./utils')

let calendarFile = `calendar.json`;

let now = new Date();
(async () => {
    fs.writeFileSync(calendarFile, `[`);
    let first = true;

    await utils.queue(bangumiData.items, async (bgmItem, log) => {
        let bangumi = bgmItem.sites.find(v => v.site == 'bangumi')
        if (!bangumi) return
        let bgmId = bangumi.id

        log.v(bgmId, bgmItem.title)
        if (bgmItem.sites.length <= 1) return
        let _subject = undefined
        let getSubject = async () => {
            while (!_subject)
                _subject = await utils.safeRequest(`https://api.bgm.tv/subject/${bgmId}/ep`, log, { json: true })
            return _subject
        }

        let filePath = `./onair/${Math.floor(bgmId / 1000)}/${bgmId}.json`
        let data = {
            id: bgmId,
            name: bgmItem.title,
            sites: [],
            eps: []
        }
        if (fs.existsSync(filePath)) try {
            data = JSON.parse(fs.readFileSync(filePath))
        } catch (e) { log.e(e.stack || e) }

        let rulePath = `./rule/${bgmId}.js`
        let rule = undefined
        if (fs.existsSync(rulePath)) try {
            rule = require(rulePath)
        } catch (e) { log.e(e.stack || e) }

        let addEpSite = async (site) => {
            let bgm_sort = (rule && rule[site.site] && rule[site.site].sort) ? rule[site.site].sort(site.sort) : site.sort
            let bgmEps = (await getSubject()).eps
            if (!bgmEps) return false
            let bgmEp = bgmEps.find(v => v.sort == bgm_sort)
            if (!bgmEp) return false
            let ep = data.eps.find(v => v.id == bgmEp.id)
            if (ep) {
                let siteIndex = ep.sites.findIndex(v => v.site == site.site && v.url == site.url)
                if (~siteIndex) {
                    ep.sites[siteIndex] = site
                } else {
                    ep.sites.push(site)
                }
                ep.sort = bgmEp.sort
                ep.name = bgmEp.name
            } else {
                data.eps.push({
                    id: bgmEp.id,
                    sort: bgmEp.sort,
                    name: bgmEp.name,
                    sites: [site]
                })
            }
            return true
        }

        let ruleNeedUpdate = (site) => {
            if (rule && rule[site.site] && rule[site.site].sort) {
                let lastEp = data.eps.reverse().find(ep => ep.sites.find(v => v.site == site.site))
                if (lastEp.sort === undefined) return true
                let lastSite = lastEp.sites.reverse().find(v => v.site == site.site)
                if (lastSite.sort === undefined) return true
                if (rule[site.site].sort(lastSite.sort, site.site) != lastEp.sort) return true
            }
            return false
        }

        let isNewSubject = ((!bgmItem.end || utils.lagDay(now, new Date(bgmItem.end)) < 10) && utils.lagDay(new Date(bgmItem.begin), now) < 10)
        for (bgmSite of bgmItem.sites) {
            if (!isNewSubject && !ruleNeedUpdate(bgmSite) && data.eps.find(ep => ep.sites.find(v => v.site == bgmSite.site))) continue
            log.v(`- ${bgmSite.site} ${bgmSite.id}`)
            if (!bgmSite.id) break
            data.sites = data.sites || []
            let site = {
                site: bgmSite.site,
                id: bgmSite.id
            }
            let siteIndex = data.sites.findIndex(v => v.site == bgmSite.site && v.id == bgmSite.id)
            if (~siteIndex) {
                site = data.sites[siteIndex]
            }
            let sitePath = `./site/${site.site}.js`
            if (fs.existsSync(sitePath)) try {
                let eps = await require(sitePath)(site, log)
                if (eps && eps.length > 0) {
                    for (ep of eps) await addEpSite(ep)
                }
                log.v(site)
            } catch (e) {
                log.e(e.stack || e)
            }
            if (site.week || site.sort) {
                if (~siteIndex) {
                    data.sites[siteIndex] = site
                } else {
                    data.sites.push(site)
                }
            }
        }
        if (data.eps.length > 0) {
            let dirPath = path.dirname(filePath)
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath)
            fs.writeFileSync(filePath, JSON.stringify(data))
        }
        // calendar
        if (isNewSubject) {
            let subject = await getSubject();
            let dateJP = utils.parseWeekTime(bgmItem.begin)
            let dateCN = utils.getChinaDate(bgmItem, data.sites)
            let eps = subject.eps && subject.eps.filter(ep => ep.airdate && Math.abs(utils.lagDay(now, new Date(ep.airdate))) < 10).map(ep => {
                let { id, type, sort, name, name_cn, airdate, status } = ep
                airdate = (new Date(airdate)).format('yyyy-MM-dd')
                return  { id, type, sort, name, name_cn, airdate, status }
            })
            if (eps && eps.length > 0) {
                if (!first)
                    fs.appendFileSync(calendarFile, `,\n`)
                first = false
                fs.appendFileSync(calendarFile, JSON.stringify({
                    id: subject.id,
                    name: subject.name,
                    name_cn: subject.name_cn,
                    air_date: subject.air_date,
                    weekDayJP: dateJP.week,
                    weekDayCN: dateCN.week,
                    timeJP: dateJP.time,
                    timeCN: dateCN.time,
                    image: subject.images && subject.images.grid,
                    sites: data.sites.filter(v => v.week),
                    eps
                }))
            }
        }
    }, 5)
    fs.appendFileSync(calendarFile, `]`);
})()