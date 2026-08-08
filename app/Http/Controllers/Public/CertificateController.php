<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use Illuminate\Contracts\View\View;

class CertificateController extends Controller
{
    public function __invoke(): View
    {
        return view('pages.certificates', [
            'certificates' => Certificate::query()
                ->active()
                ->with(['image', 'document'])
                ->ordered()
                ->get(),
        ]);
    }
}
