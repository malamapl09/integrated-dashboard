const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * User authentication validation rules
 */
const validateLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username can only contain letters, numbers, dots, underscores, and dashes'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters'),
  
  handleValidationErrors
];

const validateRegistration = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username can only contain letters, numbers, dots, underscores, and dashes'),
  
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  
  body('first_name')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 50 })
    .withMessage('First name must not exceed 50 characters')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
  
  body('last_name')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 50 })
    .withMessage('Last name must not exceed 50 characters')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
  
  handleValidationErrors
];

/**
 * Quote validation rules
 */
const validateQuote = [
  body('client_id')
    .isInt({ min: 1 })
    .withMessage('Valid client ID is required'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one quote item is required'),
  
  body('items.*.description')
    .notEmpty()
    .withMessage('Item description is required')
    .isLength({ max: 500 })
    .withMessage('Item description must not exceed 500 characters'),
  
  body('items.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Item quantity must be greater than 0'),
  
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be a valid number'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),
  
  handleValidationErrors
];

/**
 * Client validation rules
 */
const validateClient = [
  body('name')
    .notEmpty()
    .withMessage('Client name is required')
    .isLength({ max: 100 })
    .withMessage('Client name must not exceed 100 characters'),
  
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .optional()
    .matches(/^[\+]?[0-9\s\-\(\)]{7,15}$/)
    .withMessage('Please provide a valid phone number'),
  
  body('company')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Company name must not exceed 100 characters'),
  
  body('rnc')
    .optional()
    .matches(/^[0-9]{3}-[0-9]{5,7}-[0-9]$/)
    .withMessage('RNC must be in format XXX-XXXXXXX-X'),
  
  handleValidationErrors
];

/**
 * Generic ID parameter validation
 */
const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  
  handleValidationErrors
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

/**
 * Search validation
 */
const validateSearch = [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_.@]+$/)
    .withMessage('Search term contains invalid characters'),
  
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateRegistration,
  validateQuote,
  validateClient,
  validateId,
  validatePagination,
  validateSearch,
  handleValidationErrors
};