/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import APIWebUntis, { Lesson } from 'webuntis';

// Load your modules here, e.g.:
// import * as fs from "fs";

class Webuntis extends utils.Adapter {

    private startHourScheduleTimeout: any;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'webuntis',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {

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
        const untis = new APIWebUntis(this.config.school, this.config.username, this.config.client_secret, this.config.baseUrl);
        untis.login().then(async () => {
            this.log.debug('WebUntis Login erfolgreich')

            //Start the loop, we have an session
            untis.getOwnTimetableForToday().then(async (timetable) => {
                if(timetable.length > 0) {
                    this.log.debug('Timetable gefunden')

                    await this.setTimeTable(timetable);
                    await this.setStateAsync('info.connection', true, true);

                } else {
                    //Not timetable found, search next workingday
                    this.log.info('No timetable Today, search next working day');
                    untis.getOwnTimetableFor(this.getNextWorkDay(new Date())).then(async (timetable) => {
                        this.log.debug('Timetable an anderen Tag gefunden')

                        await this.setTimeTable(timetable);
                        await this.setStateAsync('info.connection', true, true);
                    });
                }
            });
        }).catch(async error => {
            this.log.error(error);
            this.log.error('Login WebUntis failed');
            await this.setStateAsync('info.connection', false, true)
        });

        // Next round in one Hour
        this.startHourSchedule()
    }

    //Function for Timetable
    async setTimeTable(timetable: Lesson[]): Promise<void> {

        let index = 0;
        timetable = timetable.sort((a,b) => a.startTime - b.startTime);

        this.log.debug(JSON.stringify(timetable));
        for(const element of timetable) {

            this.log.debug('Elemet gefunden für: ' + index.toString());
            this.log.debug(JSON.stringify(element));

            //create an Object for each elemnt on the day
            await this.setObjectNotExistsAsync(index.toString() + '.startTime', {
                type: 'state',
                common: {
                    name: 'startTime',
                    role: 'value',
                    type: 'number',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await this.setStateAsync(index.toString() + '.startTime', element.startTime, true);

            await this.setObjectNotExistsAsync(index.toString() + '.endTime', {
                type: 'state',
                common: {
                    name: 'endTime',
                    role: 'value',
                    type: 'number',
                    write: false,
                    read: true,
                },
                native: {},
            }).catch((error) => {
                this.log.error(error);
            });
            await  this.setStateAsync(index.toString() + '.endTime', element.endTime, true);

            await this.setObjectNotExistsAsync(index.toString() + '.name', {
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
            await this.setStateAsync(index.toString() + '.name', element.su[0].name, true);

            await this.setObjectNotExistsAsync(index.toString() + '.teacher', {
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
            await this.setStateAsync(index.toString() + '.teacher', element.te[0].longname, true);

            await this.setObjectNotExistsAsync(index.toString() + '.room', {
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
            await this.setStateAsync(index.toString() + '.room', element.ro[0].name, true);
            //Next Elemet
            index = index + 1;
        }

        //check if an Object is over the max index
        await this.deleteOldObject(index);
    }


    //Helpfunction
    private async deleteOldObject(index: number): Promise<void> {
        index = index
        const delObject = await this.getObjectAsync(index.toString()+ '.name')

        if (delObject) {
            this.log.debug('Object zum löschen gefunden - '  + index.toString());
            await this.delObjectAsync(index.toString(), {recursive:true});
            // Have one delted, next round
            await this.deleteOldObject(index+1);
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