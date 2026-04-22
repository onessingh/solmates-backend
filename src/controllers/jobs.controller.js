const crypto = require('crypto');
const logger = require('../utils/logger');
const { readDB, transactDB } = require('../config/database');

async function getJobs(req, res, next) {
    try {
        const db = await readDB();
        const jobs = db.manual_jobs || [];
        // Sort newest first
        const sortedJobs = [...jobs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({ success: true, count: sortedJobs.length, data: sortedJobs });
    } catch (error) {
        logger.error('Get manual jobs error', { error: error.message });
        next(error);
    }
}

async function addJob(req, res, next) {
    try {
        const { title, field, sub_field, package_info, shift, date, location, detail, contact_number, link, company } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, error: 'Job Title is required' });
        }

        const newJob = {
            id: crypto.randomBytes(16).toString('hex'),
            title: title.trim(),
            company: company || 'SOLMATES Placement',
            field: field || '',
            sub_field: sub_field || '',
            package: package_info || '',
            shift: shift || '',
            date: date || 'Recently',
            location: location || '',
            detail: detail || '',
            contact_number: contact_number || '',
            link: link || '',
            source: 'Admin Posted', // Added source for UI badge rendering
            created_at: new Date().toISOString(),
            created_by: req.admin.adminId
        };

        await transactDB(async (db) => {
            if (!db.manual_jobs) db.manual_jobs = [];
            db.manual_jobs.push(newJob);
            return true;
        });

        logger.info('Manual job added', { id: newJob.id, admin: req.admin.adminId });

        res.json({ success: true, data: newJob });
    } catch (error) {
        logger.error('Add manual job error', { error: error.message });
        next(error);
    }
}

async function deleteJob(req, res, next) {
    try {
        const { id } = req.params;

        await transactDB(async (db) => {
            if (!db.manual_jobs) db.manual_jobs = [];
            
            const initialLength = db.manual_jobs.length;
            db.manual_jobs = db.manual_jobs.filter(item => item.id !== id);
            
            if (db.manual_jobs.length === initialLength) {
                const error = new Error('Job not found');
                error.statusCode = 404;
                throw error;
            }
            return true;
        });

        logger.info('Manual job deleted', { id, admin: req.admin.adminId });

        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).json({ success: false, error: error.message });
        logger.error('Delete manual job error', { error: error.message });
        next(error);
    }
}

async function updateJob(req, res, next) {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const result = await transactDB(async (db) => {
            if (!db.manual_jobs) db.manual_jobs = [];
            const index = db.manual_jobs.findIndex(job => job.id === id);

            if (index === -1) {
                const error = new Error('Job not found');
                error.statusCode = 404;
                throw error;
            }

            const existingJob = db.manual_jobs[index];
            const updatedJob = {
                ...existingJob,
                ...updateData,
                title: (updateData.title || existingJob.title).trim(),
                updated_at: new Date().toISOString(),
                updated_by: req.admin.adminId
            };

            db.manual_jobs[index] = updatedJob;
            return updatedJob;
        });

        logger.info('Manual job updated', { id, admin: req.admin.adminId });

        res.json({ success: true, data: result });
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).json({ success: false, error: error.message });
        logger.error('Update manual job error', { error: error.message });
        next(error);
    }
}

module.exports = {
    getJobs,
    addJob,
    deleteJob,
    updateJob
};
