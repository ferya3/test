<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use Database\Factories\ContactRequestFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Every inbound lead, discriminated by `type`.
 *
 * @property ContactRequestType $type
 * @property LeadStatus $status
 */
class ContactRequest extends Model
{
    /** @use HasFactory<ContactRequestFactory> */
    use HasFactory;

    /**
     * Only the visitor-supplied fields are mass assignable. Status, triage and
     * request metadata are set explicitly by the service layer.
     */
    protected $fillable = [
        'type',
        'name',
        'company',
        'phone',
        'email',
        'province',
        'city',
        'subject',
        'message',
        'product_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => ContactRequestType::class,
            'status' => LeadStatus::class,
            'handled_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function scopeOfType(Builder $query, ContactRequestType $type): Builder
    {
        return $query->where('type', $type);
    }

    public function scopeWithStatus(Builder $query, LeadStatus $status): Builder
    {
        return $query->where('status', $status);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNot('status', LeadStatus::Closed);
    }

    public function scopeLatestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('created_at');
    }

    /**
     * Triage fields are deliberately outside `$fillable`, so they are written
     * with forceFill rather than a mass-assigning update().
     */
    public function markHandledBy(User $user, LeadStatus $status): void
    {
        $this->forceFill([
            'status' => $status,
            'handled_by' => $user->getKey(),
            'handled_at' => now(),
        ])->save();
    }
}
