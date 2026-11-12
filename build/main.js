"use strict";
/*
 * Created with @iobroker/create-adapter v2.0.2
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });

const utils = __importStar(require("@iobroker/adapter-core"));
const webuntis_1 = __importDefault(require("webuntis"));

class Webuntis extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'webuntis',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.timetableDate = new Date();
        this.class_id = 0;
    }

    async onReady() {
        if (this.config.baseUrl == '') {
            this.log.error('No baseUrl set');
        } else if (this.config.school == '') {
            this.log.error('No school set');
        } else {
            if (this.config.anonymous) {
                if (this.config.class == '') {
                    this.log.error('No class set');
                } else {
                    const untis = new webuntis_1.default.WebUntisAnonymousAuth(this.config.school, this.config.baseUrl);
                    untis.login().then(async () => {
                        this.log.debug('Anonymous Login successfully');
                        await untis.getClasses().then((classes) => {
                            for (const objClass of classes) {
                                if (objClass.name == this.config.class) {
                                    this.log.debug('Class found with id:' + objClass.id);
                                    this.class_id = objClass.id;
                                }
                            }
                        }).catch(async (error) => {
                            this.log.error(error);
                            this.log.error('Login WebUntis failed');
                            await this.setStateAsync('info.connection', false, true);
                        });
                        if (this.class_id > 0) {
                            this.readDataFromWebUntis();
                        } else {
                            this.log.error('Class not found');
                        }
                    }).catch(err => {
                        this.log.error(err);
                    });
                }
            } else {
                if (this.config.username == '') {
                    this.log.error('No username set');
                } else if (this.config.client_secret == '') {
                    this.log.error('No password set');
                } else {
                    this.log.debug('Api login started');
                    const untis = new webuntis_1.default(this.config.school, this.config.username, this.config.client_secret, this.config.baseUrl);
                    untis.login().then(async () => {
                        this.log.debug('WebUntis Login erfolgreich');
                        this.readDataFromWebUntis();
                    }).catch(async (error) => {
                        this.log.error(error);
                        this.log.error('Login WebUntis failed');
                        await this.setStateAsync('info.connection', false, true);
                    });
                }
            }
        }
    }

    onUnload(callback) {
        try {
            this.clearTimeout(this.startHourScheduleTimeout);
            callback();
        } catch (e) {
            callback();
        }
    }

    startHourSchedule() {
        if (this.startHourScheduleTimeout) {
            this.log.debug('clearing old refresh timeout');
            this.clearTimeout(this.startHourScheduleTimeout);
        }
        this.startHourScheduleTimeout = this.setTimeout(() => {
            this.log.debug('Read new data from WebUntis');
            this.startHourScheduleTimeout = null;
            this.readDataFromWebUntis();
        }, this.getMillisecondsToNextFullHour());
    }

    readDataFromWebUntis() {
        if (this.config.anonymous) {
            const untis = new webuntis_1.default.WebUntisAnonymousAuth(this.config.school, this.config.baseUrl);
            untis.login().then(async () => {
                this.log.debug('WebUntis Anonymous Login erfolgreich');
                await this.setStateAsync('info.connection', true, true);
                this.log.debug('Lese Timetable 0');
                untis.getTimetableFor(new Date(), this.class_id, webuntis_1.default.TYPES.CLASS).then(async (timetable) => {
                    if (timetable.length > 0) {
                        this.log.debug('Timetable gefunden');
                        this.timetableDate = new Date();
                        await this.setTimeTable(timetable, 0);
                    } else {
                        this.log.info('No timetable Today, search next working day');
                        this.timetableDate = this.getNextWorkDay(new Date());
                        await untis.getTimetableFor(this.timetableDate, this.class_id, webuntis_1.default.TYPES.CLASS).then(async (timetable) => {
                            this.log.info('Timetable found on next working day');
                            await this.setTimeTable(timetable, 0);
                        }).catch(async (error) => {
                            this.log.error('Cannot read Timetable data from 0');
                            this.log.debug(error);
                        });
                    }
                    this.log.debug('Lese Timetable +1');
                    const nextDay = new Date(this.timetableDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    untis.getTimetableFor(nextDay, this.class_id, webuntis_1.default.TYPES.CLASS).then(async (timetable) => {
                        await this.setTimeTable(timetable, 1);
                    }).catch(async (error) => {
                        this.log.error('Cannot read Timetable data from +1');
                        this.log.debug(error);
                    });
                });
            }).catch(async (error) => {
                this.log.error(error);
                await this.setStateAsync('info.connection', false, true);
            });
        } else {
            const untis = new webuntis_1.default(this.config.school, this.config.username, this.config.client_secret, this.config.baseUrl);
            untis.login().then(async () => {
                this.log.debug('WebUntis Login erfolgreich');
                await this.setStateAsync('info.connection', true, true);
                this.timetableDate = new Date();
                untis.getOwnTimetableFor(this.timetableDate).then(async (timetable) => {
                    if (timetable.length > 0) {
                        await this.setTimeTable(timetable, 0);
                    } else {
                        this.timetableDate = this.getNextWorkDay(new Date());
                        await untis.getOwnTimetableFor(this.timetableDate).then(async (timetable) => {
                            await this.setTimeTable(timetable, 0);
                        });
                    }
                    const nextDay = new Date(this.timetableDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    untis.getOwnTimetableFor(nextDay).then(async (timetable) => {
                        await this.setTimeTable(timetable, 1);
                    });
                }).catch(async (error) => {
                    this.log.error('Error reading own timetable');
                    this.log.debug(error);
                });

                untis.getNewsWidget(new Date()).then((newsFeed) => {
                    this.setNewsFeed(newsFeed);
                }).catch(err => this.log.debug(err));

                untis.getInbox().then((messages) => {
                    this.setInbox(messages);
                }).catch(err => this.log.debug(err));
            }).catch(async (error) => {
                this.log.error(error);
                await this.setStateAsync('info.connection', false, true);
            });
        }
        this.startHourSchedule();
    }

    async setInbox(messages) {
        await this.createAndSetState('inbox.inbox-date', new Date().toString(), 'string', 'inbox-date');
        let index = 0;
        for (const message of messages.incomingMessages) {
            await this.createAndSetState('inbox.' + index + '.subject', message.subject);
            await this.createAndSetState('inbox.' + index + '.contentPreview', message.contentPreview);
            index++;
        }
        this.deleteOldInboxObject(index);
    }

    async setNewsFeed(newsFeed) {
        await this.createAndSetState('newsfeed.newsfeed-date', new Date().toString(), 'string', 'newsfeed-date');
        let index = 0;
        for (const feed of newsFeed.messagesOfDay) {
            await this.createAndSetState('newsfeed.' + index + '.subject', feed.subject);
            await this.createAndSetState('newsfeed.' + index + '.text', feed.text);
            index++;
        }
        this.deleteOldNewsFeedObject(index);
    }

    async setTimeTable(timetable, dayindex) {
        await this.createAndSetState(dayindex + '.timetable-date', this.timetableDate.toString());
        
        let index = 0;
        let minTime = 2399;
        let maxTime = 0;
        let exceptions = false;

        timetable = timetable.sort((a, b) => a.startTime - b.startTime);
        // Kürzel → Langname aller Lehrer des Tages (für "Vertretung: X statt Y")
        const lehrerLang = {};
        for (const e of timetable) for (const t of (e.te || [])) if (t.name && t.longname) lehrerLang[t.name] = t.longname;

        for (const element of timetable) {
            const lessonPath = `${dayindex}.${index}`;

            // Zeiten
            await this.createAndSetState(lessonPath + '.startTime', webuntis_1.default.convertUntisTime(element.startTime, this.timetableDate).toString());
            if (minTime > element.startTime) minTime = element.startTime;
            
            await this.createAndSetState(lessonPath + '.endTime', webuntis_1.default.convertUntisTime(element.endTime, this.timetableDate).toString());
            if (maxTime < element.endTime) maxTime = element.endTime;

            // Name
            const subjectName = (element.su && element.su.length > 0) ? element.su[0].name : null;
            await this.createAndSetState(lessonPath + '.name', subjectName);

            // Lehrer (Lücke geschlossen: Multi-Lehrer Support)
            const teachers = (element.te && element.te.length > 0) 
                ? element.te.map(t => t.longname || t.name).join(', ') 
                : null;
            await this.createAndSetState(lessonPath + '.teacher', teachers);

            // Raum (Lücke geschlossen: Multi-Raum Support)
            const rooms = (element.ro && element.ro.length > 0) 
                ? element.ro.map(r => r.name).join(', ') 
                : null;
            await this.createAndSetState(lessonPath + '.room', rooms);

            // Info & Vertretungstext (Lücke geschlossen: Kombination beider Felder)
            let infoText = '';
            if (typeof element.info === 'string') infoText = element.info;
            else if (element.info && element.info.text) infoText = element.info.text;
            
            // Vertretung/Raumwechsel: WebUntis setzt dafür keinen code, sondern liefert den ursprünglichen Lehrer/Raum als orgname
            const lehrerWechsel = (element.te || []).filter(t => t.orgname && t.orgname !== t.name);
            const raumWechsel = (element.ro || []).filter(r => r.orgname && r.orgname !== r.name);
            const wechsel = [
                ...lehrerWechsel.map(t => `Vertretung ${t.longname || t.name} statt ${lehrerLang[t.orgname] || t.orgname}`),
                ...raumWechsel.map(r => `Raum ${r.name} statt ${r.orgname}`),
            ].join(', ');
            if (wechsel) infoText = infoText ? `${infoText} | ${wechsel}` : wechsel;

            if (element.substText) {
                infoText = infoText ? `${infoText} | Vertretung: ${element.substText}` : element.substText;
            }
            await this.createAndSetState(lessonPath + '.info', infoText, 'string', 'Zusätzliche Info');

            // Status / Code (Lücke geschlossen: Erfassung von Verschiebungen & Wechseln)
            const changeCodes = ['cancelled', 'irregular', 'substitution', 'roomchange', 'shift'];
            if (element.code && changeCodes.includes(element.code)) {
                exceptions = true;
                await this.createAndSetState(lessonPath + '.code', element.code);
            } else if (element.code !== 'cancelled' && (lehrerWechsel.length || raumWechsel.length)) {
                exceptions = true;
                await this.createAndSetState(lessonPath + '.code', lehrerWechsel.length ? 'substitution' : 'roomchange');
            } else {
                await this.createAndSetState(lessonPath + '.code', 'regular');
            }

            index++;
        }

        if (index > 0) {
            await this.createAndSetState(dayindex + '.minTime', webuntis_1.default.convertUntisTime(minTime, this.timetableDate).toString());
            await this.createAndSetState(dayindex + '.maxTime', webuntis_1.default.convertUntisTime(maxTime, this.timetableDate).toString());
            await this.createAndSetState(dayindex + '.exceptions', exceptions, 'boolean');
        }
        await this.deleteOldTimetableObject(dayindex, index);
    }

    // Hilfsfunktion zur Vermeidung von Redundanz
    async createAndSetState(path, value, type = 'string', name = '') {
        await this.setObjectNotExistsAsync(path, {
            type: 'state',
            common: {
                name: name || path.split('.').pop(),
                role: 'value',
                type: type,
                write: false,
                read: true,
            },
            native: {},
        }).catch((error) => this.log.error(error));
        await this.setStateAsync(path, value, true);
    }

    async deleteOldInboxObject(index) {
        const delObject = await this.getObjectAsync('inbox.' + index + '.subject');
        if (delObject) {
            await this.delObjectAsync('inbox.' + index, { recursive: true });
            await this.deleteOldInboxObject(index + 1);
        }
    }

    async deleteOldNewsFeedObject(index) {
        const delObject = await this.getObjectAsync('newsfeed.' + index + '.text');
        if (delObject) {
            await this.delObjectAsync('newsfeed.' + index, { recursive: true });
            await this.deleteOldNewsFeedObject(index + 1);
        }
    }

    async deleteOldTimetableObject(dayindex, index) {
        const delObject = await this.getObjectAsync(dayindex + '.' + index + '.name');
        if (delObject) {
            await this.delObjectAsync(dayindex + '.' + index, { recursive: true });
            await this.deleteOldTimetableObject(dayindex, index + 1);
        }
    }

    getNextWorkDay(date) {
        const d = new Date(+date);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() + (day > 4 ? 8 - day : 1));
        return d;
    }

    getMillisecondsToNextFullHour() {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5, 0);
        return nextHour.getTime() - now.getTime();
    }
}

if (require.main !== module) {
    module.exports = (options) => new Webuntis(options);
} else {
    (() => new Webuntis())();
}
