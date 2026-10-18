
/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to create superuser`)
    }
    
    e.next()
}, "_superusers")

onRecordUpdateRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to update superuser`)
    }
    
    e.next()
}, "_superusers")

onRecordDeleteRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to delete superuser`)
    }

    e.next()
}, "_superusers")

onRecordRequestPasswordResetRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to request password reset for superuser`)
    }

    e.next()
}, "_superusers")

onCollectionViewRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to view collection`)
    }

    e.next()
})

onCollectionCreateRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to create collection`)
    }

    e.next()
})

onCollectionUpdateRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to update collection`)
    }

    e.next()
})

onCollectionDeleteRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to delete collection`)
    }

    e.next()
})

onCollectionsImportRequest((e) => {
    const { ALLOWED_IPS } = require(`${__hooks}/superusers-allow-list.js`)
    const ip = e.realIP()
    
    if (!ALLOWED_IPS.includes(ip)) {
        throw new BadRequestError(`Not allowed to import collections`)
    }

    e.next()
})