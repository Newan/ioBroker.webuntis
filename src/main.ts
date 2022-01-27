/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import APIWebUntis, { Lesson, NewsWidget } from 'webuntis';

// Load your modules here, e.g.:
// import * as fs from "fs";

class Webuntis extends utils.Adapter {

    private startHourScheduleTimeout: any;
    private timetableDate: Date;
    private class_id: number;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'webuntis',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.timetableDate = new Date();
        this.class_id = 0;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        if (this.config.baseUrl == '') {
            this.log.error('No baseUrl set');
        } else if (this.config.school == '') {
            this.log.error('No school set');
        } else {
            if(this.config.anonymous) {
                if (this.config.class == '') {
                    this.log.error('No class set');
                } else {
                    //Anonymous login startet
                    const untis = new APIWebUntis.WebUntisAnonymousAuth(this.config.school, this.config.baseUrl);

                    untis.login().then( async ()=> {
                        this.log.debug('Anonymous Login sucessfully');
                        //search class id
                        await untis.getClasses().then( (classes) => {
                            for (const objClass of classes) {
                                if (objClass.name == this.config.class) {
                                    this.log.debug('Class found with id:' + objClass.id)
                                    this.class_id = objClass.id
                                }
                            }
                        }).catch(async error => {
                            this.log.error(error);
                            this.log.error('Login WebUntis failed');
                            await this.setStateAsync('info.connection', false, true)
                        });

                        if(this.class_id > 0) {
                            // Now we can start
                            this.readDataFromWebUntis()
                        } else {
                            this.log.error('Class not found');
                        }
                    }).catch(err => {
                        this.log.error(err);
                    })
                }
            } else {
                // Testen ob der Login funktioniert
                if (this.config.username == '') {
                    this.log.error('No username set');
                } else if (this.config.client_secret == '') {
                    this.log.error('No password set');
                } else {
                    this.log.debug('Api login started');

                    // Test to login to WebUntis
                    const untis = new APIWebUntis(this.config.school, this.config.username, this.config.client_secret, this.config.baseUrl);

                    untis.login().then(async () => {
                        this.log.debug('WebUntis Login erfolgreich')
                        // Now we can start
                        this.readDataFromWebUntis()
                    }).catch(async error => {
                        this.log.error(error);
                        this.log.error('Login WebUntis failed');
                        await this.setStateAsync('info.connection', false, true)
                    });
                }
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            callback();
            this.clearTimeout(this.startHourScheduleTimeout);
        } catch (e) {
            callback();
        }
    }
    private startHourSchedule(): void {
        if (this.startHourScheduleTimeout) {
            this.log.debug('clearing old refresh timeout');
            this.clearTimeout(this.startHourScheduleTimeout);
        }

        this.startHourScheduleTimeout = this.setTimeout(() => {
            this.log.debug('Read new data from WebUntis');
            this.readDataFromWebUntis()
        }, this.getMillisecondsToNextFullHour());
    }

    private readDataFromWebUntis(): void {
        if (this.config.anonymous) {
            const untis = new APIWebUntis.WebUntisAnonymousAuth(this.config.school, this.config.baseUrl);

            untis.login().then(async () => {
                this.log.debug('WebUntis Anonymous Login erfolgreich')
                await this.setStateAsync('info.connection', true, true);

                //Start the loop, we have an session
                untis.getTimetableFor(new Date(), this.class_id, APIWebUntis.TYPES.CLASS).then( async (timetable) => {
                    // Now we can start
                    //this.readDataFromWebUntis()
                    if(timetable.length > 0) {
                        this.log.debug('Timetable gefunden')

                        this.timetableDate = new Date(); //info timetbale is fro today
                        await this.setTimeTable(timetable, 0);

                    } else {
                        //Not timetable found, search next workingday
                        this.log.info('No timetable Today, search next working day');
                        this.timetableDate = this.getNextWorkDay(new Date());
                        untis.getTimetableFor(this.timetableDate, this.class_id, APIWebUntis.TYPES.CLASS).then(async (timetable) => {
                            this.log.debug('Timetable an anderen Tag gefunden')
                            await this.setTimeTable(timetable, 0);
                        });
                    }
                    //Next day
                    this.timetableDate.setDate(this.timetableDate.getDate() + 1);
                    untis.getTimetableFor(this.timetableDate, this.class_id, APIWebUntis.TYPES.CLASS).then(async (timetable) => {
                        await this.setTimeTable(timetable, 1);
                    });
                })
            }).catch(async error => {
                this.log.error(error);
                this.log.error('Login Anonymous WebUntis failed');
                await this.setStateAsync('info.connection', false, true)
            });

        } else {

            const untis = new APIWebUntis(this.config.school, this.config.username, this.config.client_secret, this.config.baseUrl);

            untis.login().then(async () => {
                this.log.debug('WebUntis Login erfolgreich')
                await this.setStateAsync('info.connection', true, true);

                //Start the loop, we have an session
                untis.getOwnTimetableForToday().then(async (timetable) => {
                    if(timetable.length > 0) {
                        this.log.debug('Timetable gefunden')

                        this.timetableDate = new Date(); //info timetbale is fro today
                        await this.setTimeTable(timetable, 0);

                    } else {
                        //Not timetable found, search next workingday
                        this.log.info('No timetable Today, search next working day');
                        this.timetableDate = this.getNextWorkDay(new Date());
                        untis.getOwnTimetableFor(this.timetableDate).then(async (timetable) => {
                            this.log.debug('Timetable an anderen Tag gefunden')
                            await this.setTimeTable(timetable, 0);
                        });
                    }
                    //Next day
                    this.timetableDate.setDate(this.timetableDate.getDate() + 1);
                    untis.getOwnTimetableFor(this.timetableDate).then(async (timetable) => {
                        await this.setTimeTable(timetable, 1);
                    });
                });

                //get Messages from Center
                untis.getNewsWidget(new Date()).then( (newsFeed) => {
                    this.log.debug('Get news feed from API');
                    this.log.debug(JSON.stringify(newsFeed));
                    this.setNewsFeed(newsFeed);
                })

            }).catch(async error => {
                this.log.error(error);
                this.log.error('Login WebUntis failed');
                await this.setStateAsync('info.connection', false, true)
            });
        }
        // Next round in one Hour
        this.startHourSchedule()
    }

    //Function for Newsfeed
    async setNewsFeed(newsFeed: NewsWidget): Promise<void> {
        await this.setObjectNotExistsAsync('newsfeed.newsfeed-date', {
            type: 'state',
            common: {
                name: 'newsfeed-date',
                role: 'value',
                type: 'string',
                write: false,
                read: true,
            },
            native: {},
        }).catch((error) => {
            this.log.error(error);
        });
        await this.setStateAsync('newsfeed.newsfeed-date', new Date().toString(), true);

        let index = 0;
        for(const feed of newsFeed.messagesOfDay) {
            await this.setObjectNotExistsAsync('newsfeed.' + index + '.subject', {
                type: 'state',
                common: {
                    name: 'subject',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync('newsfeed.' + index + '.subject', feed.subject, true);

            await this.setObjectNotExistsAsync('newsfeed.' + index + '.text', {
                type: 'state',
                common: {
                    name: 'text',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync('newsfeed.' + index + '.text', feed.text, true);

            //Count Element
            index = index + 1;
        }
        this.deleteOldNewsFeedObject(index);
    }

    //Function for Timetable
    async setTimeTable(timetable: Lesson[], dayindex: number): Promise<void> {
        //Info from this date is the timetable
        await this.setObjectNotExistsAsync(dayindex + '.timetable-date', {
            type: 'state',
            common: {
                name: 'timetable-date',
                role: 'value',
                type: 'string',
                write: false,
                read: true,
            },
            native: {},
        }).catch((error) => {
            this.log.error(error);
        });
        await this.setStateAsync(dayindex + '.timetable-date', this.timetableDate.toString(), true);


        let index = 0;
        let minTime = 2399;
        let maxTime = 0;
        let exceptions = false;
        timetable = timetable.sort((a,b) => a.startTime - b.startTime);

        this.log.debug(JSON.stringify(timetable));
        for(const element of timetable) {

            this.log.debug('Element found: ' + index.toString());
            this.log.debug(JSON.stringify(element));

            //create an Object for each elemnt on the day
            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.startTime', {
                type: 'state',
                common: {
                    name: 'startTime',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync(dayindex + '.' + index.toString() + '.startTime', APIWebUntis.convertUntisTime(element.startTime).toString(), true);
            //save mintime
            if (minTime > element.startTime) minTime = element.startTime;

            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.endTime', {
                type: 'state',
                common: {
                    name: 'endTime',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await  this.setStateAsync(dayindex + '.' + index.toString() + '.endTime', APIWebUntis.convertUntisTime(element.endTime).toString(), true);
            //save maxtime
            if (maxTime < element.endTime) maxTime = element.endTime;

            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.name', {
                type: 'state',
                common: {
                    name: 'name',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            if(element.su && element.su.length > 0){
                await this.setStateAsync(dayindex + '.' + index.toString() + '.name', element.su[0].name, true);
            } else {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.name', null, true);
            }

            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.teacher', {
                type: 'state',
                common: {
                    name: 'teacher',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            if(element.te && element.te.length > 0) {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.teacher', element.te[0].longname, true);
            } else {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.teacher', null, true);
            }
            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.room', {
                type: 'state',
                common: {
                    name: 'room',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            if(element.ro && element.ro.length > 0) {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.room', element.ro[0].name, true);
            } else {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.room', null, true);
            }

            await this.setObjectNotExistsAsync(dayindex + '.' + index.toString() + '.code', {
                type: 'state',
                common: {
                    name: 'code',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            if(element.code == 'cancelled' ||  element.code == 'irregular') {
                exceptions = true;
                await this.setStateAsync(dayindex + '.' + index.toString() + '.code', element.code, true);
            } else {
                await this.setStateAsync(dayindex + '.' + index.toString() + '.code', 'regular', true);
            }

            //Next Elemet
            index = index + 1;
        }

        if (index > 0) {
            //we have min one element
            await this.setObjectNotExistsAsync(dayindex + '.minTime', {
                type: 'state',
                common: {
                    name: 'minTime',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync(dayindex + '.minTime', APIWebUntis.convertUntisTime(minTime).toString(), true);

            await this.setObjectNotExistsAsync(dayindex + '.maxTime', {
                type: 'state',
                common: {
                    name: 'maxTime',
                    role: 'value',
                    type: 'string',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync(dayindex + '.maxTime', APIWebUntis.convertUntisTime(maxTime).toString(), true);

            await this.setObjectNotExistsAsync(dayindex + '.exceptions', {
                type: 'state',
                common: {
                    name: 'maxTime',
                    role: 'value',
                    type: 'boolean',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync(dayindex + '.exceptions', exceptions, true);
        }

        //check if an Object is over the max index
        await this.deleteOldTimetableObject(index);
    }


    //Helpfunction
    private async deleteOldNewsFeedObject(index: number): Promise<void> {
        index = index
        const delObject = await this.getObjectAsync('newsfeed.' + index + '.text')

        if (delObject) {
            this.log.debug('Object zum löschen gefunden - '  + index.toString());
            await this.delObjectAsync(index.toString(), {recursive:true});
            // Have one delted, next round
            await this.deleteOldTimetableObject(index+1);
        }
    }

    private async deleteOldTimetableObject(index: number): Promise<void> {
        index = index
        const delObject = await this.getObjectAsync(index.toString()+ '.name')

        if (delObject) {
            this.log.debug('Object zum löschen gefunden - '  + index.toString());
            await this.delObjectAsync(index.toString(), {recursive:true});
            // Have one delted, next round
            await this.deleteOldTimetableObject(index+1);
        }
    }

    private  getNextWorkDay(date: Date): Date {
        const d = new Date(+date);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() + (day > 4? 8 - day : 1));
        return d;
    }

    //thanks to klein0r
    private getMillisecondsToNextFullHour(): number {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5, 0);  // add 5 seconds to ensure we are in the next hour

        return nextHour.getTime() - now.getTime();
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Webuntis(options);
} else {
    // otherwise start the instance directly
    (() => new Webuntis())();
}