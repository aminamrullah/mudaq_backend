import { Test, TestingModule } from '@nestjs/testing';
import { UserWalletController } from './user-wallet.controller';

describe('UserWalletController', () => {
  let controller: UserWalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserWalletController],
    }).compile();

    controller = module.get<UserWalletController>(UserWalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
