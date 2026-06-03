import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { USERNAME_PATTERN, normalizeUsername } from '../utils/username.util';

@ValidatorConstraint({ name: 'isUsername', async: false })
export class IsUsernameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return USERNAME_PATTERN.test(normalizeUsername(value));
  }

  defaultMessage(): string {
    return 'Username must start with @ and use only lowercase letters, numbers, and underscores (no spaces)';
  }
}

export function IsUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsUsernameConstraint,
    });
  };
}
