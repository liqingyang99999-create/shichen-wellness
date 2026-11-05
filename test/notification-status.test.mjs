import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderSystemStatus} from '../lib/notification-status.mjs';

test('unknown native status never claims permission, a schedule, or a battery exemption',()=>{
 const unknown=reminderSystemStatus(null);assert.equal(unknown.count,null);assert.equal(unknown.nextAt,null);assert.equal(unknown.backgroundSupported,false);assert.doesNotMatch(unknown.notification,/已允许/);
 const partial=reminderSystemStatus({permission:'granted'});assert.match(partial.notification,/频道待核对/);assert.equal(partial.count,null);assert.equal(partial.battery,'尚未读取');
});

test('registered schedules and OS delivery restrictions remain separate facts',()=>{
 const status=reminderSystemStatus({permission:'granted',canNotify:false,scheduled:6,nextAt:1793952000000,backgroundSupported:true,scheduleMode:'inexact',exactPermission:'denied',batteryOptimizationIgnored:false,backgroundRestricted:true});
 assert.equal(status.notification,'通知频道待开启');assert.equal(status.schedule,'已登记 6 个提醒');assert.equal(status.count,6);assert.equal(status.nextAt,1793952000000);assert.match(status.battery,/受限制/);assert.equal(status.showExactSettings,true);assert.match(status.mode,/可能延迟/);
 const ready=reminderSystemStatus({permission:'granted',canNotify:true,scheduled:0,nextAt:null,backgroundSupported:true,scheduleMode:'exact',exactPermission:'granted',batteryOptimizationIgnored:true});
 assert.equal(ready.schedule,'尚未登记日程');assert.equal(ready.showExactSettings,false);assert.equal(ready.notification,'已允许');assert.equal(ready.nextAt,null);
 const partial=reminderSystemStatus({permission:'granted',canNotify:true,channels:{card:false,medicine:true,silent:true},scheduled:6});
 assert.equal(partial.notification,'部分通知频道关闭');assert.equal(partial.channelNote,'日常频道未开启');assert.equal(partial.schedule,'已登记 6 个提醒');
});
