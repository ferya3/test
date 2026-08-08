<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Certificate;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;

class CertificateController extends CrudController
{
    protected function model(): string
    {
        return Certificate::class;
    }

    protected function resource(): string
    {
        return 'certificates';
    }

    protected function title(): string
    {
        return __('admin.resources.certificates');
    }

    protected function fields(): array
    {
        return [
            Field::translated('title', __('admin.field.title'), required: true)->listed(),
            Field::translated('issuer', __('admin.field.issuer'))->listed(),
            Field::translated('description', __('admin.field.description'), long: true),
            Field::text('certificate_number', __('admin.field.certificate_number'))->listed(),
            Field::date('issued_at', __('admin.field.issued_at')),
            Field::date('expires_at', __('admin.field.expires_at'))->listed(),
            Field::media('media_id', __('admin.field.image')),
            Field::media('document_media_id', __('admin.field.document'), __('admin.hint.pdf_only')),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Certificate::query()->orderBy('position')->orderBy('id');
    }

    protected function searchable(): array
    {
        return ['title', 'certificate_number'];
    }
}
