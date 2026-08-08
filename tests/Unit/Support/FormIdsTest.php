<?php

declare(strict_types=1);

use App\Support\FormIds;

it('derives stable hint and error ids', function (): void {
    expect(FormIds::hint('phone'))->toBe('phone-hint')
        ->and(FormIds::error('phone'))->toBe('phone-error');
});

it('describes nothing when there is no hint or error', function (): void {
    expect(FormIds::describedBy('phone', hasHint: false, hasError: false))->toBeNull();
});

it('points at the hint when the field is valid', function (): void {
    expect(FormIds::describedBy('phone', hasHint: true, hasError: false))->toBe('phone-hint');
});

it('replaces the hint with the error when the field is invalid', function (): void {
    // The field component hides the hint once an error is shown, so referencing
    // it would point aria-describedby at an element that is not rendered.
    expect(FormIds::describedBy('phone', hasHint: true, hasError: true))->toBe('phone-error');
});

it('points at the error when there is no hint', function (): void {
    expect(FormIds::describedBy('phone', hasHint: false, hasError: true))->toBe('phone-error');
});
