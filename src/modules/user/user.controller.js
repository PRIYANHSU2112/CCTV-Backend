import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class UserController extends BaseController {
  constructor({ userService }) {
    super();
    this.userService = userService;

    // Bind methods to retain correct `this` reference in express router callbacks
    this.register = this.register.bind(this);
    this.loginMobile = this.loginMobile.bind(this);
    this.sendOtp = this.sendOtp.bind(this);
    this.loginOtp = this.loginOtp.bind(this);
    this.loginAdmin = this.loginAdmin.bind(this);
    this.loginUnified = this.loginUnified.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
    this.delete = this.delete.bind(this);
    this.list = this.list.bind(this);
  }

  register = this.catchAsync(async (req, res) => {
    const result = await this.userService.registerUser(req.body);
    return this.sendCreated(res, result, 'User registered successfully');
  });

  sendOtp = this.catchAsync(async (req, res) => {
    const result = await this.userService.sendOtp(req.body);
    return this.sendResponse(res, result, 'OTP sent successfully');
  });

  loginOtp = this.catchAsync(async (req, res) => {
    const result = await this.userService.loginByOtp(req.body);
    return this.sendResponse(res, result, 'User logged in successfully via OTP');
  });

  loginMobile = this.catchAsync(async (req, res) => {
    const result = await this.userService.loginByMobile(req.body);
    return this.sendResponse(res, result, 'Mobile user logged in successfully');
  });

  loginAdmin = this.catchAsync(async (req, res) => {
    const result = await this.userService.loginByAdmin(req.body);
    return this.sendResponse(res, result, 'Admin logged in successfully');
  });

  loginUnified = this.catchAsync(async (req, res) => {
    const result = await this.userService.loginUnified(req.body);
    return this.sendResponse(res, result, 'Logged in successfully');
  });

  getById = this.catchAsync(async (req, res) => {
    const user = await this.userService.getUserById(req.params.id);
    return this.sendResponse(res, user, Messages.FETCHED);
  });

  update = this.catchAsync(async (req, res) => {
    const user = await this.userService.updateUser(req.params.id, req.body);
    return this.sendResponse(res, user, Messages.UPDATED);
  });

  updateStatus = this.catchAsync(async (req, res) => {
    const user = await this.userService.updateUserStatus(req.params.id, req.body.status);
    return this.sendResponse(res, user, 'User status updated successfully');
  });

  delete = this.catchAsync(async (req, res) => {
    const result = await this.userService.deleteUser(req.params.id);
    return this.sendResponse(res, result, Messages.DELETED);
  });

  list = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.userService.listUsers(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });
}
